type ConnectionStatus = "active" | "expired" | "revoked";

export function connectionHealth(
  connection: {
    status: ConnectionStatus;
    expiresAt: Date | null;
    lastError?: string | null;
  },
  now: Date,
) {
  const status =
    connection.status === "active" &&
    connection.expiresAt !== null &&
    connection.expiresAt.getTime() <= now.getTime()
      ? "expired"
      : connection.status;
  return {
    status,
    healthy: status === "active" && !connection.lastError,
  };
}
