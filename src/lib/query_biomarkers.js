const fs = require('fs');
const { createClient } = require('/Users/federicobq/Library/Mobile Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI protocolo diagnostico integral/pdi-app/node_modules/@supabase/supabase-js');

const envPath = '/Users/federicobq/Library/Mobile Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI protocolo diagnostico integral/pdi-app/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data: patients } = await supabase.from('patients').select('*');
  console.log("Patients:", patients.map(p => ({ id: p.id, name: p.full_name })));
  
  for (const patient of patients) {
    console.log(`\n=======================================\nPatient: ${patient.full_name} (${patient.id})`);
    
    const { data: studies } = await supabase
      .from('studies')
      .select('id, file_name, created_at, exam_date')
      .eq('patient_id', patient.id);
      
    console.log("Studies:", studies);
    
    if (studies && studies.length > 0) {
      const studyIds = studies.map(s => s.id);
      const { data: biomarkers } = await supabase
        .from('biomarkers')
        .select('*')
        .in('study_id', studyIds);
        
      const edited = biomarkers.filter(b => b.is_edited);
      console.log(`\nEdited biomarkers (${edited.length}):`, edited.map(b => ({
        id: b.id,
        study_id: b.study_id,
        name: b.name,
        value: b.value,
        flag: b.flag,
        is_edited: b.is_edited,
        original_value: b.original_value
      })));
      
      const plaquetas = biomarkers.filter(b => b.name.toLowerCase().includes('plaquetas') || b.canonical_name?.toLowerCase().includes('plaquetas'));
      console.log(`\nPlaquetas records (${plaquetas.length}):`, plaquetas.map(b => ({
        id: b.id,
        study_id: b.study_id,
        name: b.name,
        value: b.value,
        unit: b.unit,
        flag: b.flag,
        is_edited: b.is_edited,
        original_value: b.original_value,
        study_date: studies.find(s => s.id === b.study_id)?.exam_date ?? studies.find(s => s.id === b.study_id)?.file_name
      })));
    }
  }
}

main().catch(console.error);
