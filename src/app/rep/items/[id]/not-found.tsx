import {RecordNotFound} from '@/components/rep/reference/parts';

/** /rep/items/<sku> for an item that doesn't exist. */
export default function ItemNotFound(){
  return <RecordNotFound title="Item not found" heading="There’s no item with that SKU" body="Check the SKU, or find the item in the catalog." back={{href:'/rep/items',label:'Back to items'}}/>;
}
