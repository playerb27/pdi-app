import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;
const getClient = () => createClient(supabaseUrl(), supabaseKey());

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getClient();
  try {
    const { id: patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    const { data, error } = await sb.storage
      .from('patient-documents')
      .download(`${patientId}/index.json`);

    if (error) {
      if (error.message.includes('Object not found') || (error as any).status === 404) {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const text = await data.text();
    let documents = [];
    try {
      documents = JSON.parse(text);
    } catch (e) {
      documents = [];
    }

    return NextResponse.json(documents);
  } catch (err: any) {
    console.error('Error GET documents:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getClient();
  try {
    const { id: patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileType = formData.get('file_type') as string;
    const notes = (formData.get('notes') as string) || '';
    const studyId = (formData.get('study_id') as string) || '';

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const docId = crypto.randomUUID();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${patientId}/${docId}_${cleanFileName}`;

    const { error: uploadErr } = await sb.storage
      .from('patient-documents')
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      return NextResponse.json({ error: `Error de subida a Storage: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = sb.storage.from('patient-documents').getPublicUrl(storagePath);

    let documents: any[] = [];
    const { data: indexData, error: indexDownloadErr } = await sb.storage
      .from('patient-documents')
      .download(`${patientId}/index.json`);

    if (!indexDownloadErr && indexData) {
      try { documents = JSON.parse(await indexData.text()); } catch (e) { documents = []; }
    }

    const newDoc = {
      id: docId,
      file_name: file.name,
      file_type: fileType || 'otro',
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
      notes,
      study_id: studyId || null,
      storage_path: storagePath,
      public_url: publicUrl,
    };

    documents.push(newDoc);

    const { error: indexUploadErr } = await sb.storage
      .from('patient-documents')
      .upload(`${patientId}/index.json`, Buffer.from(JSON.stringify(documents, null, 2)), {
        contentType: 'application/json',
        upsert: true,
      });

    if (indexUploadErr) {
      return NextResponse.json({ error: `Error guardando índice de documentos: ${indexUploadErr.message}` }, { status: 500 });
    }

    return NextResponse.json(newDoc);
  } catch (err: any) {
    console.error('Error POST documents:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PATCH: Re-link a document to a different study ──────────────────────────
// Body: { docId: string, study_id: string | null }
// Used when merging studies: source documents are re-linked to the target study
// BEFORE the source study is deleted, so no documents become orphaned.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getClient();
  try {
    const { id: patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    const { docId, study_id } = await req.json();
    if (!docId) {
      return NextResponse.json({ error: 'Falta docId' }, { status: 400 });
    }

    const { data: indexData, error: indexDownloadErr } = await sb.storage
      .from('patient-documents')
      .download(`${patientId}/index.json`);

    if (indexDownloadErr || !indexData) {
      return NextResponse.json({ error: 'No se encontró el índice de documentos' }, { status: 404 });
    }

    let documents: any[] = [];
    try {
      documents = JSON.parse(await indexData.text());
    } catch (e) {
      return NextResponse.json({ error: 'Índice de documentos corrupto' }, { status: 500 });
    }

    const docIndex = documents.findIndex((d) => d.id === docId);
    if (docIndex === -1) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    documents[docIndex] = { ...documents[docIndex], study_id: study_id ?? null };

    const { error: indexUploadErr } = await sb.storage
      .from('patient-documents')
      .upload(`${patientId}/index.json`, Buffer.from(JSON.stringify(documents, null, 2)), {
        contentType: 'application/json',
        upsert: true,
      });

    if (indexUploadErr) {
      return NextResponse.json({ error: `Error guardando índice actualizado: ${indexUploadErr.message}` }, { status: 500 });
    }

    return NextResponse.json(documents[docIndex]);
  } catch (err: any) {
    console.error('Error PATCH documents:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getClient();
  try {
    const { id: patientId } = await params;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ error: 'Falta docId' }, { status: 400 });
    }

    const { data: indexData, error: indexDownloadErr } = await sb.storage
      .from('patient-documents')
      .download(`${patientId}/index.json`);

    if (indexDownloadErr || !indexData) {
      return NextResponse.json({ error: 'No se encontró el índice de documentos' }, { status: 404 });
    }

    let documents: any[] = [];
    try {
      documents = JSON.parse(await indexData.text());
    } catch (e) {
      return NextResponse.json({ error: 'Índice de documentos corrupto' }, { status: 500 });
    }

    const docIndex = documents.findIndex((d) => d.id === docId);
    if (docIndex === -1) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const doc = documents[docIndex];

    const { error: deleteFileErr } = await sb.storage
      .from('patient-documents')
      .remove([doc.storage_path]);

    if (deleteFileErr) {
      console.warn('Advertencia al borrar archivo de storage:', deleteFileErr.message);
    }

    documents.splice(docIndex, 1);

    const { error: indexUploadErr } = await sb.storage
      .from('patient-documents')
      .upload(`${patientId}/index.json`, Buffer.from(JSON.stringify(documents, null, 2)), {
        contentType: 'application/json',
        upsert: true,
      });

    if (indexUploadErr) {
      return NextResponse.json({ error: `Error guardando índice actualizado: ${indexUploadErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error DELETE documents:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
