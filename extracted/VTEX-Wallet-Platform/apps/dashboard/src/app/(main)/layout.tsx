import { DashboardShell } from "@/components/admin/DashboardShell"

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <DashboardShell>{children}</DashboardShell>
  )
}
