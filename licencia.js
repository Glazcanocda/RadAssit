// licencia.js - Motor de Licenciamiento "Regla Dragon" (5 Equipos max)
const { createClient } = require('@supabase/supabase-js');
const { machineIdSync } = require('node-machine-id');

// Configuración de Supabase
const SUPABASE_URL = 'https://jialwffgqrrefkyihshj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5zNBQhlcBKMyAcKA_pzwzw_MNiDfWpM'; // <-- Pega tu clave de API Keys aquí

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function obtenerHardwareID() {
    try {
        return machineIdSync({ original: true });
    } catch (e) {
        return 'HW-UNKNOWN-' + Math.random().toString(36).substring(2, 9);
    }
}

async function validarLicencia(serial) {
    if (!serial || serial.trim() === '') {
        return { exito: false, mensaje: 'Por favor ingrese un serial de licencia válido.' };
    }

    const serialLimpio = serial.trim().toUpperCase();
    const currentHardwareId = obtenerHardwareID();

    try {
        // 1. Consultar la licencia en Supabase
        const { data, error } = await supabase
            .from('licencias')
            .select('*')
            .eq('serial', serialLimpio)
            .single();

        if (error || !data) {
            return { exito: false, mensaje: 'Serial no encontrado o inválido.' };
        }

        if (!data.activa) {
            return { exito: false, mensaje: 'Esta licencia se encuentra desactivada.' };
        }

        // 2. Validar expiración
        if (data.fecha_expiracion) {
            const hoy = new Date();
            const fechaExp = new Date(data.fecha_expiracion);
            if (hoy > fechaExp) {
                return { exito: false, mensaje: 'Tu licencia ha expirado. Contacta a soporte para renovar.' };
            }
        }

        // 3. Regla Dragon: Control de hasta 5 equipos
        let equipos = data.equipos_registrados || [];
        const maxEquipos = data.max_equipos || 5;

        // Verificar si este equipo ya está registrado
        const equipoYaRegistrado = equipos.includes(currentHardwareId);

        if (!equipoYaRegistrado) {
            if (equipos.length >= maxEquipos) {
                return { 
                    exito: false, 
                    mensaje: `Límite de equipos alcanzado (${equipos.length}/${maxEquipos}). Contacta a soporte para liberar un cupo.` 
                };
            }

            // Registrar este nuevo equipo automáticamente
            equipos.push(currentHardwareId);
            await supabase
                .from('licencias')
                .update({ equipos_registrados: equipos })
                .eq('id', data.id);
        }

        return {
            exito: true,
            doctor: data.nombre_doctor || 'Doctor(a)',
            email: data.email_doctor,
            equiposUsados: equipos.length,
            maxEquipos: maxEquipos
        };

    } catch (err) {
        return { exito: false, mensaje: 'Error de conexión con el servidor de licencias.' };
    }
}

module.exports = { validarLicencia, obtenerHardwareID };