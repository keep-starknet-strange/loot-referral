import type { ReactNode } from "react";

export default function BridgeLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', width: '100%' }}>
      {children}
    </div>
  );
}


