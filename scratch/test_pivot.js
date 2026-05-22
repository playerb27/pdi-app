const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rdenyvmztjbpcrwnqwqb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZW55dm16dGpicGNyd25xd3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NzU4MCwiZXhwIjoyMDkzOTUzNTgwfQ.LczS-q3Gvolq5e7axg6wIS6w4ArieFr34dsZCjUCmmM';

function getStudyDate(s) {
  const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return s.exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
}

function formatDateShort(iso) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso;
  const d = new Date(normalized);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
}

async function main() {
  const sb = createClient(supabaseUrl, serviceKey);
  const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

  const { data: studies } = await sb
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId);

  console.log('Studies with their parsed dates:');
  const sorted = [...studies].sort((a, b) => new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime());
  
  for (const s of sorted) {
    const rawDate = getStudyDate(s);
    console.log(`- ID: ${s.id}`);
    console.log(`  File: ${s.file_name}`);
    console.log(`  exam_date: ${s.exam_date}`);
    console.log(`  created_at: ${s.created_at}`);
    console.log(`  getStudyDate: ${rawDate}`);
    console.log(`  formatDateShort: ${formatDateShort(rawDate)}`);
  }
}

main().catch(console.error);
