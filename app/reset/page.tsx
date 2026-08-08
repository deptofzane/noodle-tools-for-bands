import { ResetForm } from './ResetForm';

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <h3 className="mb-2 font-serif text-4xl">
        noo<span className="text-cyan-600">dle</span>
      </h3>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="title-text">Set a new password</h1>
        <ResetForm token={token ?? ''} />
      </div>
    </main>
  );
}
