import {RecordNotFound} from '@/components/rep/reference/parts';

/** /rep/orders/<number> for an order that doesn't exist. */
export default function OrderNotFound(){
  return <RecordNotFound title="Order not found" heading="There’s no order with that number" body="Check the order number, or find it in the Orders list." back={{href:'/rep/orders',label:'Back to orders'}}/>;
}
