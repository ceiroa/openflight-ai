import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AIRCRAFT_PROFILES_DIR = path.join(__dirname, 'data', 'aircraft', 'profiles');

export async function listAircraftProfiles(baseDir = AIRCRAFT_PROFILES_DIR) {
    const files = await safeReadProfileFiles(baseDir);
    const profiles = [];

    for (const file of files) {
        const profile = await readAircraftProfileFile(path.join(baseDir, file));
        profiles.push(summarizeAircraftProfile(profile, file));
    }

    return profiles.sort((left, right) => left.aircraft.localeCompare(right.aircraft));
}

export async function getAircraftProfileById(id, baseDir = AIRCRAFT_PROFILES_DIR) {
    const safeId = sanitizeProfileId(id);
    const filePath = path.join(baseDir, `${safeId}.json`);
    return readAircraftProfileFile(filePath);
}

export async function getAircraftProfileByName(name, baseDir = AIRCRAFT_PROFILES_DIR) {
    const profiles = await listAircraftProfiles(baseDir);
    const matched = profiles.find((profile) =>
        profile.id === name
        || profile.aircraft.toLowerCase() === name.trim().toLowerCase()
    );

    if (!matched) {
        throw new Error(`Aircraft profile "${name}" was not found.`);
    }

    return getAircraftProfileById(matched.id, baseDir);
}

export async function saveAircraftProfile(profileInput, baseDir = AIRCRAFT_PROFILES_DIR) {
    const normalized = normalizeAircraftProfile(profileInput);
    await fs.mkdir(baseDir, { recursive: true });
    const filePath = path.join(baseDir, `${normalized.id}.json`);
    await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
}

export function validateAircraftProfile(profile) {
    const issues = [];
    const climbProfile = profile?.profiles?.climb;
    const cruiseProfile = profile?.profiles?.cruise65 ?? profile?.profiles?.cruise;

    if (!profile?.id) {
        issues.push('Profile id is required.');
    }
    if (!profile?.aircraft) {
        issues.push('Aircraft display name is required.');
    }
    if (!climbProfile) {
        issues.push('Climb profile is required.');
    }
    if (!cruiseProfile) {
        issues.push('Cruise profile is required.');
    }
    if (!Array.isArray(climbProfile?.climbTable) || climbProfile.climbTable.length === 0) {
        issues.push('Climb table is required.');
    }

    return {
        complete: issues.length === 0,
        issues,
    };
}

export function normalizeAircraftProfile(profile) {
    const normalizedId = sanitizeProfileId(profile?.id || profile?.aircraft || 'new-aircraft');

    return {
        schema_version: 1,
        id: normalizedId,
        aircraft: String(profile?.aircraft || '').trim(),
        manufacturer: String(profile?.manufacturer || '').trim(),
        model: String(profile?.model || '').trim(),
        engine: String(profile?.engine || '').trim(),
        source_notes: String(profile?.source_notes || '').trim(),
        profiles: {
            climb: {
                speed_kts: normalizeNumber(profile?.profiles?.climb?.speed_kts),
                rpm: normalizeNumber(profile?.profiles?.climb?.rpm),
                fuel_burn_gph: normalizeNumber(profile?.profiles?.climb?.fuel_burn_gph),
                climbTable: normalizeClimbTable(profile?.profiles?.climb?.climbTable),
            },
            ...(profile?.profiles?.cruise65 || profile?.profiles?.cruise ? {
                cruise65: {
                    speed_kts: normalizeNumber((profile?.profiles?.cruise65 ?? profile?.profiles?.cruise)?.speed_kts),
                    rpm: normalizeNumber((profile?.profiles?.cruise65 ?? profile?.profiles?.cruise)?.rpm),
                    fuel_burn_gph: normalizeNumber((profile?.profiles?.cruise65 ?? profile?.profiles?.cruise)?.fuel_burn_gph),
                },
            } : {}),
        },
        limits: {
            vne_kts: normalizeNumber(profile?.limits?.vne_kts),
            vs_kts: normalizeNumber(profile?.limits?.vs_kts),
            max_rpm: normalizeNumber(profile?.limits?.max_rpm),
        },
    };
}

function summarizeAircraftProfile(profile, fileName) {
    const validation = validateAircraftProfile(profile);

    return {
        id: profile.id || fileName.replace(/\.json$/i, ''),
        aircraft: profile.aircraft || fileName.replace(/\.json$/i, ''),
        manufacturer: profile.manufacturer || '',
        model: profile.model || '',
        engine: profile.engine || '',
        complete: validation.complete,
        issues: validation.issues,
    };
}

async function safeReadProfileFiles(baseDir) {
    try {
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map((entry) => entry.name);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function readAircraftProfileFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
}

function sanitizeProfileId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'new-aircraft';
}

function normalizeClimbTable(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row) => ({
            altitude_ft: normalizeNumber(row?.altitude_ft),
            speed_kts: normalizeNumber(row?.speed_kts),
            rate_of_climb_fpm: normalizeNumber(row?.rate_of_climb_fpm),
        }))
        .filter((row) => Object.values(row).every((value) => Number.isFinite(value)));
}

function normalizeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}
