"use client";

import { useParams } from "next/navigation";
import SupportWorkspace from "../../support-workspace";

export default function SupportThreadPage() {
  const params = useParams();
  return <SupportWorkspace id={String(params.id)}/>;
}
