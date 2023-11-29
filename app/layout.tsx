import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatbotkit Demo",
  description: "A demo of Chatbotkit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
