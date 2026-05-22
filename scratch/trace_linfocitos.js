// Check what Linfocitos looks like in DB RIGHT NOW after the edit
const path = require('path');
const fs = require('fs');
const projectPath = "/Users/federicobq/Library/Mobile Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI protocolo diagnostico integral/pdi-app";
module.paths.push(path.join(projectPath, 'node_modules'));
const { createClient } = require('@supabase/supabase-js');
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const patientId = '09cd20ed-7f5c-45df-9158-23a71fec6bc3';

// Check what getStudiesWithBiomarkers actually selects
async function checkGetStudiesSelect() {
  // Find the actual select query
  const src = fs.readFileSync(path.join(projectPath, 'src/lib/api.ts'), 'utf8');
  const match = src.match(/getStudiesWithBiomarkers[\s\S]{0,200}\.select\(([^)]+)\)/);
  if (match) {
    console.log("getStudiesWithBiomarkers SELECT query:");
    console.log(match[1]);
  }
}

async function main() {
  await checkGetStudiesSelect();

  console.log("\n=== ALL LINFOCITOS BIOMARKERS IN DB (current state) ===\n");

  const { data: studies } = await supabase
    .from('studies')
    .select('id, created_at, biomarkers(id, name, canonical_name, value, flag, is_edited, original_value)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  for (const study of studies) {
    const linfo = (study.biomarkers || []).filter(b =>
      (b.name || '').toLowerCase().includes('linfo')
    );
    if (linfo.length > 0) {
      console.log(`Study ${study.id.substring(0,8)} (${study.created_at.substring(0,10)}):`);
      for (const b of linfo) {
        console.log(`  name:"${b.name}" canonical:"${b.canonical_name}" value:"${b.value}" is_edited:${b.is_edited} flag:${b.flag}`);
      }
    }
  }

  // Now simulate dedup EXACTLY as EvolutionCharts does it
  console.log("\n=== SIMULATING DEDUP ===\n");
  const { data: allStudies } = await supabase
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  const getStudyDate = (s) => {
    const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const raw = s.exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
  };

  const sortedStudies = [...allStudies].sort((a, b) =>
    new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime()
  );

  // Collect all Linfocitos points
  const allPoints = [];
  for (const study of sortedStudies) {
    for (const bm of (study.biomarkers || [])) {
      const cn = (bm.canonical_name || '').toLowerCase();
      const n = (bm.name || '').toLowerCase();
      if (!cn.includes('linfo') && !n.includes('linfo')) continue;
      const numVal = parseFloat(bm.value);
      if (isNaN(numVal)) continue;
      if (bm.flag === 'Excluido') continue;
      allPoints.push({
        date: getStudyDate(study),
        value: numVal,
        flag: bm.flag,
        biomarkerId: bm.id,
        studyId: study.id,
        isEdited: bm.is_edited || false,
        name: bm.name,
        canonical: bm.canonical_name,
      });
    }
  }

  console.log(`Total raw Linfocitos points: ${allPoints.length}`);
  for (const p of allPoints) {
    console.log(`  ${p.date.substring(0,10)} | value:${p.value} | name:"${p.name}" | is_edited:${p.isEdited} | id:${p.biomarkerId.substring(0,8)}`);
  }

  // Compute median
  const sortedVals = [...allPoints].map(p => p.value).sort((a,b) => a-b);
  const median = sortedVals[Math.floor(sortedVals.length / 2)];
  console.log(`\nMedian of all points: ${median}`);

  // Dedup
  const byDay = new Map();
  for (const pt of allPoints) {
    const key = pt.date.slice(0, 10);
    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, pt);
    } else if (pt.isEdited && !existing.isEdited) {
      console.log(`  Preferring edited point for ${key}: ${pt.value} over ${existing.value}`);
      byDay.set(key, pt);
    } else if (!pt.isEdited && existing.isEdited) {
      console.log(`  Keeping edited point for ${key}: ${existing.value} over ${pt.value}`);
    } else if (Math.abs(pt.value - median) < Math.abs(existing.value - median)) {
      console.log(`  Replacing ${key}: ${existing.value} → ${pt.value} (closer to median ${median})`);
      byDay.set(key, pt);
    } else {
      console.log(`  Keeping ${key}: ${existing.value} over ${pt.value} (existing closer to median ${median})`);
    }
  }

  console.log(`\n=== FINAL POINTS AFTER DEDUP (what the chart shows) ===`);
  for (const [day, pt] of byDay) {
    console.log(`  ${day}: value=${pt.value} name="${pt.name}" is_edited=${pt.isEdited} id:${pt.biomarkerId.substring(0,8)}`);
  }
}

main().catch(console.error);
