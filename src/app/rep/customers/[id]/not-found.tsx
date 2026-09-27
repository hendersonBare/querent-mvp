import {RecordNotFound} from '@/components/rep/reference/parts';

/** /rep/customers/<id> for a customer that doesn't exist. */
export default function CustomerNotFound(){
  return <RecordNotFound title="Customer not found" heading="There’s no customer at that address" body="Check the link, or pick the customer from the list." back={{href:'/rep/customers',label:'Back to customers'}}/>;
}
