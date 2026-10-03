"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdminWorkspace from "@/components/admin-workspace";
import AdminShell, { managementSections } from "@/components/admin-shell";

function ManagementRoute() {
  const params = useSearchParams();
  const tab = managementSections.find(section => section.id === params.get("tab"))?.id || "users";
  return <AdminWorkspace key={tab} tab={tab} />;
}

export default function ManagementPage() {
  return <Suspense fallback={<AdminShell><p role="status">Đang tải quản trị…</p></AdminShell>}><ManagementRoute /></Suspense>;
}
