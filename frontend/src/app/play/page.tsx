import type { Metadata } from "next";
import { PuppyHome } from "@/components/puppy-home";

export const metadata: Metadata = { title: "우리 집 · PuppyRuby" };
export default function PlayPage() { return <PuppyHome />; }
