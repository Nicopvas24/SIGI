// Repositorio base: acceso a datos sobre Supabase (PostgreSQL)
import { supabase } from '../../config/supabase.js';

export class BaseRepository {
  constructor(tabla) {
    this.tabla = tabla;
  }

  get query() {
    return supabase.from(this.tabla);
  }

  async listar(filtros = {}, { orden = 'created_at', asc = false, select = '*' } = {}) {
    let q = this.query.select(select);
    for (const [campo, valor] of Object.entries(filtros)) {
      q = Array.isArray(valor) ? q.in(campo, valor) : q.eq(campo, valor);
    }
    const { data, error } = await q.order(orden, { ascending: asc });
    if (error) throw new Error(`[${this.tabla}] ${error.message}`);
    return data;
  }

  async porId(id, select = '*') {
    const { data, error } = await this.query.select(select).eq('id', id).maybeSingle();
    if (error) throw new Error(`[${this.tabla}] ${error.message}`);
    return data;
  }

  async crear(valores) {
    const { data, error } = await this.query.insert(valores).select().single();
    if (error) throw new Error(`[${this.tabla}] ${error.message}`);
    return data;
  }

  async actualizar(id, valores) {
    const { data, error } = await this.query.update(valores).eq('id', id).select().single();
    if (error) throw new Error(`[${this.tabla}] ${error.message}`);
    return data;
  }

  async eliminar(id) {
    const { error } = await this.query.delete().eq('id', id);
    if (error) throw new Error(`[${this.tabla}] ${error.message}`);
  }
}
