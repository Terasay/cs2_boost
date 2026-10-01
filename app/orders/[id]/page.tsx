"use client";
import { useParams } from "next/navigation";
import OrderWorkspace from "../../order-workspace";
export default function OrderDetail() { const params = useParams(); return <OrderWorkspace key={String(params.id)} id={String(params.id)}/>; }
