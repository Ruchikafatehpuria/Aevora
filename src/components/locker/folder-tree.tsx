"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Folder, FolderOpen, FolderPlus, Inbox, Layers, Pencil, Star, Trash2 } from "lucide-react";
import { createFolder, deleteFolder, moveFiles, renameFolder } from "@/lib/locker/actions";
import { cn } from "@/lib/utils";
import { FILE_DRAG_TYPE } from "./file-list";

export type FolderNode = { id: string; name: string; parentId: string | null; count: number };

function useDrop(folderId: string | null) {
  const [over, setOver] = useState(false);
  const [, start] = useTransition();
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes(FILE_DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const raw = e.dataTransfer.getData(FILE_DRAG_TYPE);
        if (raw) start(() => moveFiles(JSON.parse(raw) as string[], folderId));
      },
    },
  };
}

function Row({ node, nodes, current, depth }: { node: FolderNode; nodes: FolderNode[]; current: string | null; depth: number }) {
  const children = nodes.filter((n) => n.parentId === node.id);
  const active = current === node.id;
  const { over, props } = useDrop(node.id);
  const [pending, start] = useTransition();
  return (
    <li>
      <div
        {...props}
        className={cn(
          "group flex items-center gap-1 rounded-lg pr-1 text-sm transition-colors",
          active ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2",
          over && "ring-2 ring-primary",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <Link href={`/locker/files?folder=${node.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
          {active ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0 text-ink-3" />}
          <span className="truncate">{node.name}</span>
          {node.count > 0 && <span className="text-xs text-ink-3">{node.count}</span>}
        </Link>
        <div className="hidden items-center group-hover:flex group-focus-within:flex">
          <button
            className="rounded p-1 text-ink-3 hover:text-ink"
            aria-label={`New folder in ${node.name}`}
            disabled={pending}
            onClick={() => {
              const name = prompt(`New folder inside "${node.name}"`);
              if (name) start(() => createFolder(name, node.id).then(() => {}));
            }}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 text-ink-3 hover:text-ink"
            aria-label={`Rename ${node.name}`}
            onClick={() => {
              const name = prompt("Rename folder", node.name);
              if (name && name !== node.name) start(() => renameFolder(node.id, name).catch((e: Error) => alert(e.message)));
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 text-ink-3 hover:text-danger"
            aria-label={`Delete ${node.name}`}
            onClick={() => {
              if (confirm(`Delete "${node.name}" and its subfolders? Files inside are not deleted; they move back to the Inbox.`)) start(() => deleteFolder(node.id));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <Row key={c.id} node={c} nodes={nodes} current={current} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({
  nodes, current, view, inboxCount, totalCount, starredCount, trashCount,
}: {
  nodes: FolderNode[];
  current: string | null;
  view: "all" | "inbox" | "folder" | "trash" | "starred";
  inboxCount: number;
  totalCount: number;
  starredCount: number;
  trashCount: number;
}) {
  const inboxDrop = useDrop(null);
  const [, start] = useTransition();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Folders</p>
        <button
          className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label="New folder"
          onClick={() => {
            const name = prompt("New folder name");
            if (name) start(() => createFolder(name, null).then(() => {}));
          }}
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-0.5">
        <li>
          <Link href="/locker/files" className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", view === "all" ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2")}>
            <Layers className="h-4 w-4" /> All files <span className="ml-auto text-xs text-ink-3">{totalCount}</span>
          </Link>
        </li>
        <li>
          <Link href="/locker/files?folder=starred" className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", view === "starred" ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2")}>
            <Star className="h-4 w-4" /> Starred <span className="ml-auto text-xs text-ink-3">{starredCount}</span>
          </Link>
        </li>
        <li {...inboxDrop.props}>
          <Link
            href="/locker/files?folder=inbox"
            className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", view === "inbox" ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2", inboxDrop.over && "ring-2 ring-primary")}
          >
            <Inbox className="h-4 w-4" /> Inbox (unfiled) <span className="ml-auto text-xs text-ink-3">{inboxCount}</span>
          </Link>
        </li>
        {nodes.filter((n) => !n.parentId).map((n) => (
          <Row key={n.id} node={n} nodes={nodes} current={current} depth={0} />
        ))}
      </ul>
      {nodes.length === 0 && <p className="px-2 pt-2 text-xs text-ink-3">No folders yet. Create one, or accept an AI suggestion.</p>}
      <Link
        href="/locker/files?folder=trash"
        className={cn("mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", view === "trash" ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2")}
      >
        <Trash2 className="h-4 w-4" /> Trash <span className="ml-auto text-xs text-ink-3">{trashCount}</span>
      </Link>
      <p className="px-2 pt-4 text-xs text-ink-3">Tip: drag files onto a folder to move them.</p>
    </div>
  );
}
