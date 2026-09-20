package com.puppyruby.admin;

import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;

import static org.junit.jupiter.api.Assertions.*;

class DesktopPeFileVersionTest {
    @Test
    void readsFixedFileVersionFromBoundedPeResourceRanges() {
        byte[] fixture = DesktopReleaseServiceTest.pe("12.34.56.65535", (byte) 7);
        var requested = new java.util.ArrayList<Integer>();
        String version = DesktopPeFileVersion.read(fixture.length, (first, last) -> {
            int length = Math.toIntExact(last - first + 1); requested.add(length);
            return java.util.Arrays.copyOfRange(fixture, Math.toIntExact(first), Math.toIntExact(last + 1));
        });
        assertEquals("12.34.56.65535", version);
        assertTrue(requested.stream().allMatch(length -> length <= DesktopPeFileVersion.MAX_RANGE_BYTES));
        assertTrue(requested.size() < 16);
    }

    @Test
    void rejectsMissingConflictingOrMalformedVersionResources() {
        byte[] missing = DesktopReleaseServiceTest.pe("0.10.2.0", (byte) 1);
        missing[0x414] = 0; // Remove the root RT_VERSION directory pointer.
        assertThrows(IllegalArgumentException.class, () -> read(missing));
        byte[] malformed = DesktopReleaseServiceTest.pe("0.10.2.0", (byte) 1);
        malformed[0x4a8] = 0; // Corrupt VS_FIXEDFILEINFO signature.
        assertThrows(IllegalArgumentException.class, () -> read(malformed));
    }

    @Test
    void readsBothActualVersion01020WindowsBuildFixturesWhenStagedAssetsAreAvailable() throws Exception {
        Path root = Path.of("..").toAbsolutePath().normalize();
        Path executable = root.resolve("local-assets/site/downloads/PuppyRuby.exe");
        Path installer = root.resolve("local-assets/site/downloads/PuppyRuby-Setup.exe");
        Assumptions.assumeTrue(Files.isRegularFile(executable) && Files.isRegularFile(installer),
            "large Windows fixtures are intentionally excluded from Git");
        assertEquals("0.10.2.0", read(executable));
        assertEquals("0.10.2.0", read(installer));
    }

    private static String read(byte[] bytes) {
        return DesktopPeFileVersion.read(bytes.length, (first, last) ->
            java.util.Arrays.copyOfRange(bytes, Math.toIntExact(first), Math.toIntExact(last + 1)));
    }
    private static String read(Path path) throws Exception {
        long size = Files.size(path);
        try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
            return DesktopPeFileVersion.read(size, (first, last) -> {
                try {
                    byte[] bytes = new byte[Math.toIntExact(last - first + 1)];
                    file.seek(first); file.readFully(bytes); return bytes;
                } catch (java.io.IOException error) { throw new IllegalStateException(error); }
            });
        }
    }
}
