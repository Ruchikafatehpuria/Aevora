import { FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileType, FileVideo, Presentation } from "lucide-react";
import { kindOf } from "@/lib/locker/config";
import { cn } from "@/lib/utils";

const MAP = {
  pdf: { Icon: FileText, cls: "text-red-500 bg-red-500/10" },
  document: { Icon: FileText, cls: "text-sky-500 bg-sky-500/10" },
  text: { Icon: FileType, cls: "text-slate-500 bg-slate-500/10" },
  spreadsheet: { Icon: FileSpreadsheet, cls: "text-emerald-600 bg-emerald-500/10" },
  presentation: { Icon: Presentation, cls: "text-orange-500 bg-orange-500/10" },
  image: { Icon: FileImage, cls: "text-violet-500 bg-violet-500/10" },
  video: { Icon: FileVideo, cls: "text-pink-500 bg-pink-500/10" },
  audio: { Icon: FileAudio, cls: "text-amber-500 bg-amber-500/10" },
  archive: { Icon: FileArchive, cls: "text-yellow-600 bg-yellow-500/10" },
} as const;

export function FileIcon({ extension, className }: { extension: string; className?: string }) {
  const { Icon, cls } = MAP[kindOf(extension) ?? "text"];
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", cls, className)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
