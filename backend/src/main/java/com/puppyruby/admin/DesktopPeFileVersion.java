package com.puppyruby.admin;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Bounded, platform-independent reader for the fixed file version in a PE VERSIONINFO resource. */
final class DesktopPeFileVersion {
    static final int MAX_RANGE_BYTES = 1024 * 1024;
    private static final int RT_VERSION = 16;
    private static final long FIXED_SIGNATURE = 0xFEEF04BDL;

    @FunctionalInterface interface RangeReader { byte[] read(long first, long last); }
    private record Section(long virtualAddress, long virtualSize, long rawOffset, long rawSize) {}

    static String read(long fileSize, RangeReader source) {
        if (fileSize < 128 || fileSize > DesktopReleaseSettings.MAX_FILE_BYTES || source == null) throw invalid();
        byte[] dos = exact(source, 0, 63);
        if (dos[0] != 'M' || dos[1] != 'Z') throw invalid();
        long peOffset = u32(dos, 60);
        if (peOffset < 64 || peOffset > fileSize - 24) throw invalid();
        byte[] pe = exact(source, peOffset, peOffset + 23);
        if (pe[0] != 'P' || pe[1] != 'E' || pe[2] != 0 || pe[3] != 0) throw invalid();
        int sectionsCount = u16(pe, 6), optionalSize = u16(pe, 20);
        if (sectionsCount < 1 || sectionsCount > 96 || optionalSize < 120 || optionalSize > 4096) throw invalid();
        long optionalOffset = add(peOffset, 24, fileSize);
        byte[] optional = exact(source, optionalOffset, add(optionalOffset, optionalSize - 1L, fileSize));
        int magic = u16(optional, 0);
        int directoryBase, numberOffset;
        if (magic == 0x10b) { directoryBase = 96; numberOffset = 92; }
        else if (magic == 0x20b) { directoryBase = 112; numberOffset = 108; }
        else throw invalid();
        if (optional.length < directoryBase + 24 || u32(optional, numberOffset) < 3) throw invalid();
        long resourceRva = u32(optional, directoryBase + 16), resourceSize = u32(optional, directoryBase + 20);
        if (resourceRva == 0 || resourceSize < 32 || resourceSize > 16L * 1024 * 1024) throw invalid();

        long sectionOffset = add(optionalOffset, optionalSize, fileSize);
        long sectionBytes = Math.multiplyExact((long) sectionsCount, 40L);
        byte[] table = exact(source, sectionOffset, add(sectionOffset, sectionBytes - 1, fileSize));
        var sections = new ArrayList<Section>(sectionsCount);
        for (int index = 0; index < sectionsCount; index++) {
            int at = index * 40;
            sections.add(new Section(u32(table, at + 12), u32(table, at + 8), u32(table, at + 20), u32(table, at + 16)));
        }
        long resourceRaw = rawOffset(sections, resourceRva, Math.min(resourceSize, 16));
        var directory = new ResourceDirectory(source, fileSize, resourceRva, resourceRaw, resourceSize, sections);
        long typeDirectory = directory.findId(0, RT_VERSION, true);
        List<Long> names = directory.children(typeDirectory, true);
        var dataEntries = new ArrayList<Long>();
        for (long name : names) dataEntries.addAll(directory.children(name, false));
        if (dataEntries.isEmpty() || dataEntries.size() > 32) throw invalid();
        Set<String> versions = new LinkedHashSet<>();
        for (long entry : dataEntries) {
            byte[] data = directory.data(entry);
            versions.add(version(data));
        }
        if (versions.size() != 1) throw invalid();
        return versions.iterator().next();
    }

    private static final class ResourceDirectory {
        final RangeReader source;
        final long fileSize, rootRva, rootRaw, treeSize;
        final List<Section> sections;
        ResourceDirectory(RangeReader source, long fileSize, long rootRva, long rootRaw, long treeSize, List<Section> sections) {
            this.source = source; this.fileSize = fileSize; this.rootRva = rootRva; this.rootRaw = rootRaw;
            this.treeSize = treeSize; this.sections = sections;
        }

        long findId(long relative, int wanted, boolean directory) {
            for (Entry entry : entries(relative))
                if (!entry.named && entry.id == wanted && entry.directory == directory) return entry.offset;
            throw invalid();
        }

        List<Long> children(long relative, boolean directories) {
            var result = new ArrayList<Long>();
            for (Entry entry : entries(relative)) {
                if (entry.directory != directories) throw invalid();
                result.add(entry.offset);
            }
            if (result.isEmpty() || result.size() > 32) throw invalid();
            return result;
        }

        List<Entry> entries(long relative) {
            requireTree(relative, 16);
            byte[] header = exact(source, add(rootRaw, relative, fileSize), add(add(rootRaw, relative, fileSize), 15, fileSize));
            int count = u16(header, 12) + u16(header, 14);
            if (count < 1 || count > 256) throw invalid();
            long entriesRelative = add(relative, 16, treeSize);
            long bytes = Math.multiplyExact((long) count, 8L);
            requireTree(entriesRelative, bytes);
            long first = add(rootRaw, entriesRelative, fileSize);
            byte[] values = exact(source, first, add(first, bytes - 1, fileSize));
            var result = new ArrayList<Entry>(count);
            for (int index = 0; index < count; index++) {
                long name = u32(values, index * 8), target = u32(values, index * 8 + 4);
                boolean named = (name & 0x80000000L) != 0, directory = (target & 0x80000000L) != 0;
                long offset = target & 0x7fffffffL;
                requireTree(offset, directory ? 16 : 16);
                result.add(new Entry(named, (int)(name & 0xffff), directory, offset));
            }
            return result;
        }

        byte[] data(long entryRelative) {
            requireTree(entryRelative, 16);
            long first = add(rootRaw, entryRelative, fileSize);
            byte[] entry = exact(source, first, add(first, 15, fileSize));
            long rva = u32(entry, 0), size = u32(entry, 4);
            if (size < 64 || size > MAX_RANGE_BYTES) throw invalid();
            long raw = rawOffset(sections, rva, size);
            return exact(source, raw, add(raw, size - 1, fileSize));
        }

        void requireTree(long relative, long length) {
            if (relative < 0 || length < 1 || relative > treeSize - length) throw invalid();
        }
        record Entry(boolean named, int id, boolean directory, long offset) {}
    }

    private static String version(byte[] data) {
        if (data.length < 64) throw invalid();
        int blockLength = u16(data, 0), valueLength = u16(data, 2);
        if (blockLength < 64 || blockLength > data.length || valueLength < 52) throw invalid();
        int cursor = 6;
        StringBuilder key = new StringBuilder();
        boolean terminated = false;
        while (cursor + 1 < blockLength && key.length() <= 32) {
            int character = u16(data, cursor); cursor += 2;
            if (character == 0) { terminated = true; break; }
            key.append((char) character);
        }
        if (!terminated || !"VS_VERSION_INFO".contentEquals(key)) throw invalid();
        cursor = (cursor + 3) & ~3;
        if (cursor > blockLength - 52 || u32(data, cursor) != FIXED_SIGNATURE) throw invalid();
        long ms = u32(data, cursor + 8), ls = u32(data, cursor + 12);
        return ((ms >>> 16) & 0xffff) + "." + (ms & 0xffff) + "." + ((ls >>> 16) & 0xffff) + "." + (ls & 0xffff);
    }

    private static long rawOffset(List<Section> sections, long rva, long length) {
        for (Section section : sections) {
            long span = Math.max(section.virtualSize, section.rawSize);
            if (rva < section.virtualAddress || rva - section.virtualAddress > span) continue;
            long delta = rva - section.virtualAddress;
            if (delta < 0 || length < 1 || delta > section.rawSize - length) throw invalid();
            return Math.addExact(section.rawOffset, delta);
        }
        throw invalid();
    }

    private static byte[] exact(RangeReader source, long first, long last) {
        long length = last - first + 1;
        if (first < 0 || last < first || length > MAX_RANGE_BYTES) throw invalid();
        byte[] result = source.read(first, last);
        if (result == null || result.length != length) throw invalid();
        return result;
    }
    private static long add(long left, long right, long limit) {
        try {
            long result = Math.addExact(left, right);
            if (result < 0 || result >= limit) throw invalid();
            return result;
        } catch (ArithmeticException error) { throw invalid(); }
    }
    private static int u16(byte[] value, int offset) {
        if (offset < 0 || offset > value.length - 2) throw invalid();
        return Short.toUnsignedInt(ByteBuffer.wrap(value, offset, 2).order(ByteOrder.LITTLE_ENDIAN).getShort());
    }
    private static long u32(byte[] value, int offset) {
        if (offset < 0 || offset > value.length - 4) throw invalid();
        return Integer.toUnsignedLong(ByteBuffer.wrap(value, offset, 4).order(ByteOrder.LITTLE_ENDIAN).getInt());
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Windows 실행 파일 버전 정보를 확인할 수 없어요."); }
    private DesktopPeFileVersion() {}
}
