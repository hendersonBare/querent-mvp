// Herrick's industrial catalog: every item in the mockup plus deliberate near-duplicates
// (Grade 5 vs 8, 1-1/2 vs 2 in, Type 1 vs 27, glove sizes) so chat has to clarify.
// Prices and qty are per pack. `customer` is Wasatch's price-level price.

export const CATEGORIES=[
  {id:'fasteners',name:'Fasteners'},
  {id:'abrasives',name:'Abrasives & Cutting'},
  {id:'safety',name:'Safety & PPE'},
  {id:'material-handling',name:'Material Handling & Tie-downs'},
  {id:'tools',name:'Tools'},
  {id:'janitorial',name:'Janitorial/MRO'},
] as const;
export type CategoryId=typeof CATEGORIES[number]['id'];

export interface CatalogItem{sku:string;description:string;category:CategoryId;pack:string;caseQty:number;cost:number;list:number;customer:number;
  /** Available at [SLC, Ogden, Provo]. */
  stock:[number,number,number];keywords:string}

type Tuple=[sku:string,description:string,pack:string,caseQty:number,cost:number,list:number,customer:number,stock:[number,number,number],keywords:string];
const group=(category:CategoryId,rows:Tuple[])=>rows.map(([sku,description,pack,caseQty,cost,list,customer,stock,keywords]):CatalogItem=>({sku,description,category,pack,caseQty,cost,list,customer,stock,keywords}));

export const CATALOG:CatalogItem[]=[
  ...group('fasteners',[
    ['HCS-12-13-2G8','Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc','Box of 50',10,21.40,38.95,30.95,[64,22,8],'bolt hex bolt'],
    ['HCS-12-13-2G5','Hex cap screw 1/2-13 x 2 in, Grade 5, zinc plated','Box of 50',10,14.60,26.50,21.95,[58,30,12],'bolt hex bolt'],
    ['HCS-12-13-112G8','Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc','Box of 50',10,18.90,34.50,27.60,[41,18,6],'bolt hex bolt'],
    ['HCS-12-13-3G8','Hex cap screw 1/2-13 x 3 in, Grade 8, yellow zinc','Box of 25',10,17.80,32.40,26.25,[36,14,5],'bolt hex bolt'],
    ['HCS-38-16-1G5','Hex cap screw 3/8-16 x 1 in, Grade 5, zinc plated','Box of 100',10,9.40,17.25,14.10,[88,45,20],'bolt hex bolt'],
    ['HCS-58-11-3G8','Hex cap screw 5/8-11 x 3 in, Grade 8, yellow zinc','Box of 25',5,27.50,49.80,40.25,[22,10,4],'bolt hex bolt'],
    ['HN-12-13-G8','Hex nut 1/2-13, Grade 8, yellow zinc','Box of 100',10,9.80,19.95,16.50,[75,40,22],'nut'],
    ['HN-12-13-G5','Hex nut 1/2-13, Grade 5, zinc plated','Box of 100',10,6.90,13.40,11.25,[62,35,18],'nut'],
    ['HN-38-16-G5','Hex nut 3/8-16, Grade 5, zinc plated','Box of 100',10,4.20,8.60,7.10,[90,44,25],'nut'],
    ['FW-12-G8','Flat washer 1/2 in, Grade 8, yellow zinc','Box of 100',10,7.40,15.75,12.95,[60,31,14],'washer'],
    ['FW-12-SAE','Flat washer 1/2 in, SAE, zinc plated','Box of 100',10,4.10,8.25,6.95,[70,28,16],'washer'],
    ['LW-12-ZP','Split lock washer 1/2 in, zinc plated','Box of 100',10,3.60,7.40,6.10,[55,26,12],'lock washer'],
    ['ANC-12-414-W','Wedge anchor 1/2 x 4-1/4 in, zinc plated','Box of 25',4,16.80,31.50,25.95,[30,12,9],'concrete anchor'],
    ['TEK-12-1-HWH','Self-drilling screw #12 x 1 in, hex washer head','Box of 250',8,11.20,21.90,17.80,[48,20,15],'tek screw self tapping'],
  ]),
  ...group('abrasives',[
    ['CW-45-045-T1','Cut-off wheel 4.5 x .045 x 7/8 in, Type 1','Box of 25',4,24.10,46.00,38.95,[140,60,35],'cutoff cut off disc thin flat'],
    ['CW-45-045-T27','Cut-off wheel 4.5 x .045 x 7/8 in, Type 27','Box of 25',4,25.30,47.50,39.80,[48,20,10],'cutoff cut off disc depressed center'],
    ['CW-6-045-T1','Cut-off wheel 6 x .045 x 7/8 in, Type 1','Box of 25',4,33.60,63.00,52.95,[36,15,8],'cutoff cut off disc'],
    ['CW-45-090-T27','Cut-off wheel 4.5 x .090 x 7/8 in, Type 27','Box of 25',4,28.40,52.00,43.75,[26,12,6],'cutoff cut off disc thick'],
    ['FD-45-60Z','Flap disc 4.5 in, 60 grit zirconia','Box of 10',4,31.00,56.95,47.50,[52,18,9],'flap wheel sanding'],
    ['FD-45-80Z','Flap disc 4.5 in, 80 grit zirconia','Box of 10',4,31.00,56.95,47.50,[40,16,7],'flap wheel sanding'],
    ['FD-45-40Z','Flap disc 4.5 in, 40 grit zirconia','Box of 10',4,32.20,58.50,48.90,[28,11,5],'flap wheel sanding'],
    ['GW-45-14-T27','Grinding wheel 4.5 x 1/4 x 7/8 in, Type 27','Box of 10',4,29.50,54.00,45.20,[34,14,8],'grinding disc'],
    ['WB-4-CS','Wire cup brush 4 in, crimped carbon steel, 5/8-11 arbor','Each',6,8.40,16.95,13.75,[45,20,11],'wire wheel'],
    ['SD-5-80-HL','Sanding disc 5 in, 80 grit, hook and loop','Box of 50',5,11.60,22.40,18.25,[60,25,14],'sandpaper orbital'],
    ['BSB-4478-1418','Band saw blade 44-7/8 in, 14/18 TPI, bi-metal','Pack of 3',1,24.90,46.50,38.40,[18,8,4],'portaband blade'],
  ]),
  ...group('safety',[
    ['GLV-N8-L-1000','Nitrile disposable gloves, 8 mil, black, size L','Case of 1,000',1,58.00,94.00,77.50,[9,14,3],'gloves nitrile large'],
    ['GLV-N8-M-1000','Nitrile disposable gloves, 8 mil, black, size M','Case of 1,000',1,58.00,94.00,77.50,[12,9,4],'gloves nitrile medium'],
    ['GLV-N8-XL-1000','Nitrile disposable gloves, 8 mil, black, size XL','Case of 1,000',1,60.40,97.00,80.25,[7,8,2],'gloves nitrile extra large'],
    ['GLV-N6-L-1000','Nitrile disposable gloves, 6 mil, blue, size L','Case of 1,000',1,44.50,74.00,61.25,[15,10,6],'gloves nitrile large'],
    ['GLV-CR-A4-L','Cut-resistant gloves, ANSI A4, size L','Pack of 12 pairs',1,42.00,79.50,64.95,[20,9,5],'gloves work gloves cut resistant'],
    ['SG-CLR-AF','Safety glasses, clear anti-fog','Box of 12',1,18.20,36.00,29.90,[44,25,12],'glasses eye protection'],
    ['SG-SMK-AF','Safety glasses, smoke anti-fog','Box of 12',1,18.20,36.00,29.90,[30,16,9],'glasses eye protection tinted'],
    ['EP-FOAM-200','Foam earplugs, corded, NRR 32','Box of 100 pairs',1,21.40,39.95,32.95,[26,12,8],'ear plugs hearing protection'],
    ['HV-C2-LM-XL','Hi-vis safety vest, ANSI Class 2, lime, size XL','Each',10,5.80,12.50,9.95,[80,35,20],'vest reflective'],
    ['HH-T1-WHT','Hard hat, Type 1 Class E, ratchet suspension, white','Each',12,9.60,21.00,16.95,[48,24,12],'hardhat helmet'],
    ['RESP-N95-20','N95 particulate respirator','Box of 20',1,16.40,32.00,26.50,[33,14,10],'mask dust mask'],
  ]),
  ...group('material-handling',[
    ['RS-2-27-JH','Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks','Each',10,14.20,28.50,22.95,[7,20,0],'tie down strap'],
    ['RS-2-30-FH','Ratchet strap 2 in x 30 ft, 3,333 lb WLL, flat hooks','Each',10,15.60,29.25,23.40,[30,16,4],'tie down strap'],
    ['RS-112-20-SH','Ratchet strap 1-1/2 in x 20 ft, 1,000 lb WLL, S-hooks','Each',10,8.90,17.50,13.95,[42,18,10],'tie down strap'],
    ['RS-4-30-FH','Ratchet strap 4 in x 30 ft, 5,400 lb WLL, flat hooks','Each',5,27.80,52.00,42.50,[12,8,3],'tie down strap'],
    ['EDG-2-4PK','Ratchet strap edge protector, 2 in','4 pack',6,6.10,13.95,11.25,[38,12,6],'corner protector'],
    ['TC-38-G70-20','Transport chain 3/8 in x 20 ft, Grade 70, clevis hooks','Each',1,48.60,89.00,73.50,[14,6,3],'binder chain'],
    ['LB-38-LVR','Lever load binder, 3/8-1/2 in chain','Each',1,24.30,45.00,36.95,[18,9,4],'chain binder boomer'],
    ['WS-2-6-EE','Web sling 2 in x 6 ft, 2-ply, eye and eye','Each',1,12.40,24.00,19.50,[25,10,6],'lifting sling nylon'],
    ['SW-18-1500','Stretch wrap 18 in x 1,500 ft, 80 gauge','Case of 4 rolls',1,44.00,78.00,64.95,[20,12,6],'pallet wrap film'],
    ['BC-ASST-24','Bungee cord assortment, 24 pc','Each',6,9.80,19.95,15.95,[26,12,7],'bungee straps'],
  ]),
  ...group('tools',[
    ['DBS-29-HSS','Drill bit set, 29 pc, HSS, 1/16 to 1/2 in','Each',1,38.50,72.00,58.95,[10,5,3],'drill bits'],
    ['DB-12-COB','Cobalt drill bit 1/2 in, jobber length','Each',6,9.60,18.50,14.95,[24,10,6],'drill bit'],
    ['SKT-38-SAE-24','Socket set 3/8 in drive, SAE, 24 pc','Each',1,46.00,89.00,72.50,[8,4,2],'sockets ratchet set'],
    ['TM-25','Tape measure 25 ft','Each',6,7.80,16.95,13.50,[36,15,9],'tape measure'],
    ['UK-RET','Utility knife, retractable','Each',12,4.60,9.95,7.95,[50,22,14],'box cutter razor knife'],
    ['UKB-HD-100','Utility knife blades, heavy duty','Pack of 100',1,11.40,22.00,17.95,[30,14,8],'razor blades'],
    ['PB-12','Pry bar 12 in','Each',6,6.20,12.95,10.40,[20,9,5],'crowbar'],
    ['MK-PNT-WHT','Paint marker, white, medium tip','Box of 12',1,14.80,28.80,23.40,[22,10,6],'paint pen marker'],
  ]),
  ...group('janitorial',[
    ['DT-2-60','Duct tape 2 in x 60 yd, silver','Case of 24',1,62.00,118.00,96.00,[11,6,3],'tape'],
    ['DT-2-60-BK','Duct tape 2 in x 60 yd, black','Case of 24',1,64.00,121.00,98.50,[6,4,2],'tape'],
    ['DT-3-60','Duct tape 3 in x 60 yd, silver','Case of 16',1,61.00,115.00,94.25,[5,3,1],'tape'],
    ['RAG-WHT-25','Cotton wiping rags, white','25 lb box',1,28.50,54.00,44.25,[18,8,5],'shop rags towels'],
    ['DEG-HD-4G','Heavy-duty degreaser','Case of 4 gal',1,26.40,49.00,39.95,[16,7,4],'cleaner solvent'],
    ['TL-55-BLK','Trash can liners 55 gal, 1.5 mil, black','Case of 100',1,21.80,41.00,33.50,[24,11,6],'garbage bags trash bags'],
    ['PT-8-800','Paper towel rolls, 8 in x 800 ft','Case of 6',1,24.60,46.00,37.75,[20,10,5],'hand towels'],
    ['SP-UNIV-100','Universal absorbent pads, 15 x 19 in','Bale of 100',1,38.00,72.00,58.95,[12,6,3],'sorbent spill pads'],
  ]),
];

/** Inbound purchase orders, as [sku, branch id, qty, days after the anchor]. */
export const INBOUND:[string,string,number,number][]=[['RS-2-27-JH','slc',24,3],['GLV-N8-L-1000','slc',12,5]];

export function catalogItem(sku:string){const item=CATALOG.find(i=>i.sku===sku);if(!item)throw new Error(`Unknown seed SKU ${sku}`);return item;}
