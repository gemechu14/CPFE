import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toApiError } from '@/lib/http';

/** Mutation that invalidates the given keys and toasts success/error. */
export function useAction<TVars>(fn: (v: TVars) => Promise<unknown>, keys: QueryKey[], success: string | ((v: TVars) => string), onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(typeof success === 'function' ? success(v) : success);
      onDone?.();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });
}

/** Parses a positive money input; returns null if invalid. */
export function parseAmount(v: string): number | null {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}
