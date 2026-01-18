'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

interface CreatePostProps {
  userId: string;
  onPostCreated: () => void;
}

export default function CreatePost({ userId, onPostCreated }: CreatePostProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Formato nao suportado. Use JPG, PNG, GIF, WebP ou MP4.');
      return;
    }

    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('Arquivo muito grande. Maximo 50MB.');
      return;
    }

    setFile(selectedFile);
    setError('');

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError('');

    const supabase = createClient();

    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('posts')
        .getPublicUrl(fileName);

      // Create post
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

      const { error: postError } = await supabase.from('posts').insert({
        user_id: userId,
        media_url: publicUrl,
        media_type: mediaType,
        caption: caption.trim(),
      });

      if (postError) throw postError;

      // Reset form
      setCaption('');
      setFile(null);
      setPreview(null);
      setIsOpen(false);
      onPostCreated();
    } catch (err) {
      setError('Erro ao criar post. Tente novamente.');
      console.error(err);
    }

    setLoading(false);
  };

  const resetForm = () => {
    setCaption('');
    setFile(null);
    setPreview(null);
    setError('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-secondary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-secondary-dark transition z-40"
      >
        <PlusIcon className="w-8 h-8" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-2xl p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <button onClick={resetForm} className="text-gray-500">
            Cancelar
          </button>
          <h2 className="font-semibold">Novo Post</h2>
          <button
            onClick={handleSubmit}
            disabled={!file || loading}
            className="text-primary font-semibold disabled:opacity-50"
          >
            {loading ? 'Postando...' : 'Postar'}
          </button>
        </div>

        {error && (
          <div className="bg-secondary/10 text-secondary text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File input */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-primary transition"
          >
            {preview ? (
              <div className="relative aspect-square max-h-64 mx-auto">
                {file?.type.startsWith('video/') ? (
                  <video src={preview} className="w-full h-full object-contain rounded" />
                ) : (
                  <Image
                    src={preview}
                    alt="Preview"
                    fill
                    className="object-contain rounded"
                  />
                )}
              </div>
            ) : (
              <div className="py-8">
                <CameraIcon className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-500">Toque para adicionar foto ou video</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Caption */}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Escreva uma legenda..."
            rows={3}
            className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:border-primary resize-none"
          />
        </form>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
