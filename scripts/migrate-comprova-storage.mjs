import { createClient } from "@supabase/supabase-js";

const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const destinationUrl = process.env.DEST_SUPABASE_URL;
const destinationKey = process.env.DEST_SUPABASE_SERVICE_ROLE_KEY;

if (!sourceUrl || !sourceKey || !destinationUrl || !destinationKey) {
  throw new Error("Defina SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY, DEST_SUPABASE_URL e DEST_SUPABASE_SERVICE_ROLE_KEY apenas no ambiente local.");
}

const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const destination = createClient(destinationUrl, destinationKey, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "comprova" } });

const { data: receipts, error: receiptsError } = await source.from("receipts").select("id,storage_path").order("created_at", { ascending: true });
if (receiptsError) throw receiptsError;

let uploaded = 0;
let bytes = 0;
const failures = [];
for (const receipt of receipts || []) {
  try {
    const { data: file, error: downloadError } = await source.storage.from("receipts").download(receipt.storage_path);
    if (downloadError || !file) throw downloadError || new Error("arquivo vazio");
    const body = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await destination.storage.from("comprova-documents").upload(receipt.storage_path, body, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
    uploaded += 1;
    bytes += body.byteLength;
    console.log(`OK ${uploaded}/${receipts.length} ${receipt.storage_path}`);
  } catch (error) {
    failures.push({ path: receipt.storage_path, error: error instanceof Error ? error.message : String(error) });
    console.error(`FALHA ${receipt.storage_path}`);
  }
}

const { data: destinationObjects, error: destinationError } = await destination.from("receipts").select("id,storage_path");
if (destinationError) throw destinationError;
const destinationPaths = new Set((destinationObjects || []).map((row) => row.storage_path));
console.log(JSON.stringify({ sourceReceipts: receipts?.length || 0, uploaded, bytes, destinationRows: destinationObjects?.length || 0, missingRows: (receipts || []).filter((row) => !destinationPaths.has(row.storage_path)).length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
