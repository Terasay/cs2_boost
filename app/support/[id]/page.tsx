"use client";

import { useParams } from "next/navigation";
import SupportChat from "../support-chat";

export default function SupportThreadPage() {
  const params = useParams();
  return <SupportChat id={String(params.id)}/>;
}
