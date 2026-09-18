import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export const SCHEMA_VERSION=1;
export const databasePath=()=>resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH||'./data/querent.sqlite');
let singleton:Database.Database|undefined;

export function db(){
  if(singleton)return singleton;
  const path=databasePath();
  mkdirSync(dirname(path),{recursive:true});
  singleton=new Database(path);
  singleton.pragma('journal_mode = WAL');
  singleton.pragma('foreign_keys = ON');
  bootstrap(singleton);
  return singleton;
}

function bootstrap(database:Database.Database){
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reps(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS access(customer_id TEXT NOT NULL,category TEXT NOT NULL,enabled INTEGER NOT NULL,rep_id TEXT,PRIMARY KEY(customer_id,category));
    CREATE TABLE IF NOT EXISTS parts_stock(id TEXT PRIMARY KEY,sku TEXT UNIQUE,description TEXT,branch TEXT,quantity INTEGER,unit_price REAL);
    CREATE TABLE IF NOT EXISTS equipment_stock(id TEXT PRIMARY KEY,stock_number TEXT UNIQUE,model TEXT,branch TEXT,condition TEXT,quantity INTEGER,price REAL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_id TEXT,order_number TEXT UNIQUE,description TEXT,status TEXT,order_date TEXT,expected_delivery TEXT,tracking_number TEXT,total REAL);
    CREATE VIEW IF NOT EXISTS orders_current AS SELECT * FROM orders WHERE status IN ('quoted','open','shipped');
    CREATE VIEW IF NOT EXISTS orders_past AS SELECT * FROM orders WHERE status IN ('delivered','closed');
    CREATE TABLE IF NOT EXISTS service_records(id TEXT PRIMARY KEY,customer_id TEXT,equipment TEXT,service_date TEXT,description TEXT,status TEXT,cost REAL);
    CREATE TABLE IF NOT EXISTS financing(id TEXT PRIMARY KEY,customer_id TEXT,plan_number TEXT,equipment TEXT,balance REAL,monthly_payment REAL,next_payment_date TEXT,maturity_date TEXT);
    CREATE TABLE IF NOT EXISTS other(id TEXT PRIMARY KEY,customer_id TEXT UNIQUE,account_number TEXT,business_name TEXT,branch TEXT,address TEXT,contact_name TEXT,contact_email TEXT);
    CREATE TABLE IF NOT EXISTS query_logs(id TEXT PRIMARY KEY,customer_id TEXT,conversation_id TEXT,question TEXT,categories TEXT,handled_categories TEXT,sql TEXT,row_count INTEGER,latency_ms INTEGER,outcome TEXT,answer TEXT,timestamp TEXT);
    CREATE INDEX IF NOT EXISTS query_logs_scope ON query_logs(customer_id,conversation_id,timestamp);
    CREATE TABLE IF NOT EXISTS sync_events(id INTEGER PRIMARY KEY AUTOINCREMENT,timestamp TEXT,message TEXT);
  `);
  const version=database.prepare("SELECT value FROM meta WHERE key='schema_version'").pluck().get() as string|undefined;
  if(version&&Number(version)!==SCHEMA_VERSION)throw new Error(`SQLite schema ${version} is incompatible with ${SCHEMA_VERSION}. Run npm run db:reset.`);
  database.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));
  seed(database);
}

function seed(database:Database.Database){
  if((database.prepare('SELECT count(*) FROM customers').pluck().get() as number)>0)return;
  database.transaction(()=>{
    const customers=[['wasatch','Wasatch Excavation LLC'],['bonneville','Bonneville Grading Co.']];
    const reps=[['dallen','Dallen Rozema','(801) 111-2222','dallen.rozema@centuryeq.com'],['mara','Mara Jensen','(801) 555-0102','mara.jensen@example.com'],['eli','Eli Porter','(801) 555-0103','eli.porter@example.com'],['nora','Nora Chen','(801) 555-0104','nora.chen@example.com']];
    const insertCustomer=database.prepare('INSERT INTO customers VALUES(?,?)'); customers.forEach(x=>insertCustomer.run(...x));
    const insertRep=database.prepare('INSERT INTO reps VALUES(?,?,?,?)'); reps.forEach(x=>insertRep.run(...x));
    const insertAccess=database.prepare('INSERT INTO access VALUES(?,?,1,?)');
    for(const [id] of customers)for(const category of ['parts_stock','equipment_stock','service_records','orders_past','orders_current','financing','other'])insertAccess.run(id,category,category==='other'?null:'dallen');
    const part=database.prepare('INSERT INTO parts_stock VALUES(?,?,?,?,?,?)');
    const partNames=['Hydraulic filter','Bucket tooth','Air filter','Track roller','Fuel filter','Seal kit'];
    for(let i=1;i<=60;i++)part.run(`part-${i}`,`PART-${String(i).padStart(4,'0')}`,partNames[(i-1)%6],i%2===0?'Salt Lake City':'Ogden',10+i,25+i*3.5);
    const equipment=database.prepare('INSERT INTO equipment_stock VALUES(?,?,?,?,?,?,?)');
    const models=['CASE CX210D','CASE 580N','CASE 621G','CASE TR340'];
    for(let i=1;i<=20;i++)equipment.run(`equipment-${i}`,`EQ-${String(i).padStart(3,'0')}`,models[(i-1)%4],i%2===0?'Salt Lake City':'Ogden',i%3===0?'Used':'New',1,65000+i*4500);
    const order=database.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)');
    const desc=['Hydraulic filter kit','Bucket teeth set','CASE CX210D parts','Track maintenance kit']; const statuses=['shipped','open','quoted','delivered','closed'];
    for(const [customer] of customers)for(let i=1;i<=20;i++){const day=String(1+i%10).padStart(2,'0');const due=String(18+i%5).padStart(2,'0');const status=statuses[(i-1)%5];order.run(`${customer}-order-${i}`,customer,`PO-${(customer==='wasatch'?48212:59212)+i}`,desc[(i-1)%4],status,`2026-09-${day}`,`2026-09-${due}`,[0,3,4].includes((i-1)%5)?`FXF-${880000+i}`:null,250+i*125);}
    const finance=database.prepare('INSERT INTO financing VALUES(?,?,?,?,?,?,?,?)');
    for(const [customer] of customers)for(let i=1;i<=4;i++)finance.run(`${customer}-financing-${i}`,customer,`FIN-${1000+i}`,models[i-1],84000-i*8000,1500+i*125,'2026-10-01','2030-10-01');
    const service=database.prepare('INSERT INTO service_records VALUES(?,?,?,?,?,?,?)');
    const serviceNames=['500-hour maintenance','Hydraulic inspection','Track adjustment'];
    for(const [customer] of customers)for(let i=1;i<=15;i++){const date=new Date(Date.UTC(2026,8,15-i*7)).toISOString().slice(0,10);service.run(`${customer}-service-${i}`,customer,models[(i-1)%3],date,serviceNames[(i-1)%3],'Completed',300+i*80);}
    const account=database.prepare('INSERT INTO other VALUES(?,?,?,?,?,?,?,?)');
    account.run('wasatch-account','wasatch','CE-1001','Wasatch Excavation LLC','Salt Lake City','1250 West Industrial Drive, Salt Lake City, UT','Jordan Lee','operations@example.com');
    account.run('bonneville-account','bonneville','CE-1002','Bonneville Grading Co.','Salt Lake City','1250 West Industrial Drive, Salt Lake City, UT','Alex Morgan','operations@example.com');
    const log=database.prepare('INSERT INTO query_logs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    const cats=['parts_stock','equipment_stock','orders_current','orders_past','service_records','financing','other'];
    for(let i=1;i<=40;i++){const c=cats[(i-1)%7];log.run(`historical-${i}`,'bonneville','historical','Historical lookup '+i,JSON.stringify([c]),JSON.stringify([c]),null,1,950,'answered','Historical account lookup completed.',new Date(Date.UTC(2026,8,16,18-i*2)).toISOString());}
    database.prepare('INSERT INTO sync_events(timestamp,message) VALUES(?,?)').run(new Date().toISOString(),'ERP connection refreshed');
  })();
}

export function closeDatabase(){singleton?.close();singleton=undefined;}
