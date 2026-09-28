export default function HealthCheck() {
  return (
    <pre style={{ fontFamily: "monospace", padding: 24 }}>
      VTEX API — OK{"\n"}
      Routeur tRPC exposé sur /api/trpc/*
    </pre>
  )
}
