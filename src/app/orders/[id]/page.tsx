import { OrderDetailClient } from "@/components/OrderDetailClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function OrderPage({ params }: PageProps) {
  const { id } = await params;
  return <OrderDetailClient id={id} />;
}
