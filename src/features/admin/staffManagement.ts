import { supabase } from '../../lib/supabase';

export type StaffRole = 'admin' | 'waiter';

export interface TeamMember {
    id: string;
    userId: string;
    email: string | null;
    role: StaffRole;
    active: boolean;
    openVisits: number;
}

export interface TeamInvite {
    id: string;
    email: string;
    role: StaffRole;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    expiresAt: string;
}

export interface TeamState {
    members: TeamMember[];
    invitations: TeamInvite[];
}

export interface StaffExtendedProfile {
    id: string;
    name: string;
    email: string;
    phone: string;
    cpf: string;
    birthDate: string;
    avatarUrl?: string;
    cargo: string;
    active: boolean;
    permissions: string[];
    createdAt: string;
}

const PROFILES_STORAGE_KEY = 'elozi_staff_profiles_';

export function getStoredStaffProfiles(slug: string): Record<string, StaffExtendedProfile> {
    try {
        const raw = localStorage.getItem(`${PROFILES_STORAGE_KEY}${slug}`);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

export function saveStoredStaffProfile(slug: string, profile: StaffExtendedProfile): void {
    try {
        const map = getStoredStaffProfiles(slug);
        map[profile.id] = profile;
        if (profile.email) {
            map[profile.email.toLowerCase()] = profile;
        }
        localStorage.setItem(`${PROFILES_STORAGE_KEY}${slug}`, JSON.stringify(map));
    } catch (e) {
        console.error('Falha ao salvar perfil local do funcionário:', e);
    }
}

export function deleteStoredStaffProfile(slug: string, idOrEmail: string): void {
    try {
        const map = getStoredStaffProfiles(slug);
        delete map[idOrEmail];
        delete map[idOrEmail.toLowerCase()];
        localStorage.setItem(`${PROFILES_STORAGE_KEY}${slug}`, JSON.stringify(map));
    } catch (e) {
        console.error('Falha ao remover perfil local do funcionário:', e);
    }
}

export async function teamRpc<T>(name: string, values: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, values);
    if (error)
        throw new Error(['42501', '22023', '55000'].includes(error.code) ? error.message : 'Não foi possível atualizar a equipe. Confira a conexão e a migration.');
    return data as T;
}

export const getTeam = (slug: string) => teamRpc<TeamState>('get_staff_management', { p_slug: slug });

export async function createInvite(slug: string, email: string, role: StaffRole) {
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    await teamRpc('create_staff_invitation', { p_slug: slug, p_email: email, p_role: role, p_token: token });
    return `${window.location.origin}/convite?token=${token}`;
}

export const revokeInvite = (slug: string, id: string) => teamRpc('revoke_staff_invitation', { p_slug: slug, p_id: id });

export const updateMember = (slug: string, member: TeamMember, role: StaffRole, active: boolean) => teamRpc('update_staff_member', {
    p_slug: slug, p_id: member.id, p_role: role, p_active: active, p_expected_role: member.role, p_expected_active: member.active,
});

export const transferVisits = (slug: string, from: string, to: string) => teamRpc<number>('transfer_staff_visits', { p_slug: slug, p_from: from, p_to: to });

export const acceptInvite = (token: string) => teamRpc<{
    slug: string;
    role: StaffRole;
}>('accept_staff_invitation', { p_token: token });
