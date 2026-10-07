// Types fondamentaux partagés entre client, simulation et serveur.

export type ResKey = 'gold' | 'wood' | 'energy' | 'crystals';
export const RES_KEYS: ResKey[] = ['gold', 'wood', 'energy', 'crystals'];
export type Cost = Partial<Record<ResKey, number>>;
export type Resources = Record<ResKey, number>;

export const RES_ICON: Record<ResKey, string> = { gold: '🪙', wood: '🪵', energy: '⚡', crystals: '💎' };
export const RES_NAME: Record<ResKey, string> = { gold: 'Or', wood: 'Bois', energy: 'Énergie', crystals: 'Cristaux' };

export interface Vec2 { x: number; y: number }

export type Quality = 'low' | 'medium' | 'high';

/** Résultat d'une action de règle : succès + éventuel message d'erreur lisible. */
export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export const ok = <T>(data?: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });
