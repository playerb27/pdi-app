// Find Monocitos biomarkers and trace EXACTLY what the EvolutionCharts useMemo does
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

// Simulate normalizeBiomarkerName (simplified)
function normalizeBiomarkerName(name) {
  if (!name) return '';
  let n = name.trim().toLowerCase();
  n = n.replace(/\*+/g, '').trim();
  // Key mappings
  const MAP = {
    'monocitos': 'Monocitos', 'monocytes': 'Monocitos',
    'plaquetas': 'Plaquetas', 'platelets': 'Plaquetas', 'cuenta de plaquetas': 'Plaquetas',
  };
  for (const [k, v] of Object.entries(MAP)) {
    if (n === k || n.startsWith(k)) return v;
  }
  // Title case fallback
  return n.replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  console.log("=== TRACING MONOCITOS DATA FLOW ===\n");
  
  const { data: studies, error } = await supabase
    .from('studies')
    .select('*, biomarkers(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  
  if (error) { console.log("ERROR:", error.message); return; }
  
  console.log(`Found ${studies.length} studies\n`);
  
  // Find ALL Monocitos biomarkers across all studies
  console.log("=== ALL MONOCITOS BIOMARKERS IN DB ===");
  for (const study of studies) {
    const monocitos = (study.biomarkers || []).filter(b => {
      const n = (b.name || '').toLowerCase();
      return n.includes('monoc');
    });
    if (monocitos.length > 0) {
      console.log(`\nStudy ID: ${study.id.substring(0, 8)}... (created: ${study.created_at.substring(0, 10)})`);
      for (const m of monocitos) {
        console.log(`  Biomarker: "${m.name}"`);
        console.log(`  ID: ${m.id}`);
        console.log(`  value: "${m.value}"`);
        console.log(`  is_edited: ${m.is_edited}`);
        console.log(`  canonical_name: "${m.canonical_name}"`);
        
        // CRITICAL: What does the dedup pick?
        const numVal = parseFloat(m.value);
        console.log(`  numVal: ${numVal} (parseFloat)`);
        if (isNaN(numVal)) console.log(`  ⚠️  SKIPPED BY EVOLUTION CHARTS (parseFloat returns NaN)`);
      }
    }
  }
  
  console.log("\n\n=== SIMULATING EvolutionCharts useMemo ===");
  
  // Get study dates
  const getStudyDate = (s) => {
    const fileDate = s.file_name?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const raw = s.exam_date ?? (fileDate ? fileDate + 'T12:00:00' : s.created_at);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
  };
  
  const sortedStudies = [...studies].sort((a, b) => new Date(getStudyDate(a)).getTime() - new Date(getStudyDate(b)).getTime());
  
  const map = {};
  for (const study of sortedStudies) {
    if (!study.biomarkers) continue;
    for (const bm of study.biomarkers) {
      const numVal = parseFloat(bm.value);
      if (isNaN(numVal)) continue;
      if (bm.flag === 'Excluido') continue;
      const canonicalName = bm.canonical_name ?? normalizeBiomarkerName(bm.name);
      if (!canonicalName.toLowerCase().includes('monoc')) continue;
      
      if (!map[canonicalName]) {
        map[canonicalName] = { name: canonicalName, points: [] };
      }
      map[canonicalName].points.push({
        date: getStudyDate(study),
        value: numVal,
        flag: bm.flag,
        biomarkerId: bm.id,
        studyId: study.id,
        isEdited: bm.is_edited || false,
        originalValue: bm.original_value || null,
      });
    }
  }
  
  for (const [name, series] of Object.entries(map)) {
    console.log(`\nSeries: "${name}" — ${series.points.length} raw points`);
    for (const p of series.points) {
      console.log(`  Date: ${p.date.substring(0,10)}, value: ${p.value}, biomarkerId: ${p.biomarkerId ? p.biomarkerId.substring(0,8)+'...' : 'NULL!'}, isEdited: ${p.isEdited}`);
    }
    
    // Simulate deduplication
    if (series.points.length >= 2) {
      const sortedVals = [...series.points].map(p => p.value).sort((a, b) => a - b);
      const median = sortedVals[Math.floor(sortedVals.length / 2)];
      console.log(`  Median: ${median}`);
      
      const byDay = new Map();
      for (const pt of series.points) {
        const key = pt.date.slice(0, 10);
        const existing = byDay.get(key);
        if (!existing) {
          byDay.set(key, pt);
        } else {
          if (pt.isEdited && !existing.isEdited) {
            byDay.set(key, pt);
          } else if (!pt.isEdited && existing.isEdited) {
            // keep existing
          } else if (Math.abs(pt.value - median) < Math.abs(existing.value - median)) {
            byDay.set(key, pt);
          }
        }
      }
      
      console.log(`\n  After deduplication — ${byDay.size} points:`);
      for (const [day, pt] of byDay) {
        console.log(`  Date: ${day}, value: ${pt.value}, biomarkerId: ${pt.biomarkerId ? pt.biomarkerId.substring(0,8)+'...' : '⚠️ NULL!'}, isEdited: ${pt.isEdited}`);
      }
    }
  }
  
  console.log("\n\n=== DIAGNOSIS ===");
  console.log("If any point shows biomarkerId: NULL → ExpandedChartModal will NOT save to DB!");
  console.log("If a point is replaced by dedup with a DIFFERENT biomarker → wrong row gets updated.");
}

main().catch(console.error);
