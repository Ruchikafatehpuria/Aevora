"use client";

import { useTransition } from "react";
import { emptyTrash } from "@/lib/locker/actions";
import { Button } from "@/components/ui/button";

export function EmptyTrashButton() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" className="text-danger" loading={pending} onClick={() => confirm("Permanently delete everything in Trash? This can't be undone.") && start(() => emptyTrash())}>
      Empty Trash
    </Button>
  );
}
