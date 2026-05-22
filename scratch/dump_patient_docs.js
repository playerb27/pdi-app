const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // we'll run it with env

if (!supabaseServiceKey) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseServiceKey);
const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

async function main() {
  const { data, error } = await sb.storage
    .from('patient-documents')
    .download(`${patientId}/index.json`);

  if (error) {
    console.error('Error downloading:', error);
    return;
  }

  const text = await data.text();
  console.log('Documents index:');
  console.log(JSON.stringify(JSON.parse(text), null, 2));
}

main().catch(console.error);
