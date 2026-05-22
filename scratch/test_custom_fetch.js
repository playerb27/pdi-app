const path = require('path');
const fs = require('fs');
const projectPath = "/Users/federicobq/Library/Mobile Documents/com~apple~CloudDocs/ANTIGRAVITY/PDI protocolo diagnostico integral/pdi-app";
module.paths.push(path.join(projectPath, 'node_modules'));

const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(projectPath, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase client with custom fetch that sets cache: 'no-store'
const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options) => {
      console.log(`Intercepted fetch URL: ${url}`);
      console.log(`Original cache option: ${options?.cache}`);
      const newOptions = {
        ...options,
        cache: 'no-store'
      };
      return globalThis.fetch(url, newOptions);
    }
  }
});

async function main() {
  console.log("Testing custom fetch with cache: 'no-store' option...");
  const { data, error } = await supabase
    .from('patients')
    .select('id')
    .limit(1);
    
  if (error) {
    console.error("Query failed:", error.message);
  } else {
    console.log("Query succeeded! Result length:", data.length);
  }
}

main().catch(console.error);
