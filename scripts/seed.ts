// Dati di esempio INVENTATI (mai dati reali di clienti): 2 studi, 1 admin e 3 collaboratori ciascuno,
// clienti con indicatori in vari stati, compiti, commenti e comunicazioni.
// Uso: npm run seed  (legge .env.local). Opzione --forza per rifarli se esistono già.
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

const PASSWORD = process.env.SEED_PASSWORD ?? 'Prova-BigBrother-2026'
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type P = { id: string; email: string; nome: string; cognome: string }

async function come<T>(p: P, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: p.id, email: p.email, role: 'authenticated' })}, true), set_config('role', 'authenticated', true)`
    return fn(tx)
  }) as Promise<T>
}

async function utenteAuth(email: string, nome: string, cognome: string): Promise<P> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { nome, cognome } })
  if (error) throw new Error(`${email}: ${error.message}`)
  return { id: data.user.id, email, nome, cognome }
}

const fineMese = (mesiFa: number) => {
  const d = new Date()
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - mesiFa + 1, 0))
  return x.toISOString().slice(0, 10)
}

type ClienteSeed = { rs: string; titolari: [string, string][]; email: string[]; iva: number | null | 'na'; pn: number | null; dip?: number; fatt?: number; piva?: string }

const CLIENTI_A: ClienteSeed[] = [
  { rs: 'Auto Shop S.r.l.', titolari: [['Enzo', "D'Agosta"]], email: ['info@autoshop-esempio.it', 'autoshop@pec-esempio.it'], iva: 1, pn: 1, dip: 6, fatt: 850000, piva: '01234560011' },
  { rs: 'Panificio Il Grano', titolari: [['Maria', 'Lombardo']], email: ['panificio.ilgrano@esempio.it'], iva: 3, pn: 4, dip: 3, fatt: 210000 },
  { rs: 'Rossi Costruzioni S.p.A.', titolari: [['Mario', 'Rossi'], ['Luca', 'Rossi']], email: ['amministrazione@rossicostruzioni-esempio.it'], iva: 1, pn: 2, dip: 42, fatt: 6400000, piva: '02345670012' },
  { rs: 'Studio Dentistico Sorriso', titolari: [['Giulia', 'Ferri']], email: ['segreteria@sorriso-esempio.it'], iva: 'na', pn: 1, dip: 4, fatt: 390000 },
  { rs: 'Bar Centrale di Neri Paolo', titolari: [['Paolo', 'Neri']], email: [], iva: 5, pn: 6, dip: 2, fatt: 120000 },
  { rs: 'Ortofrutta Siciliana S.a.s.', titolari: [['Salvatore', 'Greco']], email: ['ortofrutta.siciliana@esempio.it'], iva: 2, pn: 2 },
  { rs: 'Tech Solutions S.r.l.s.', titolari: [['Chiara', 'Marino']], email: ['chiara@techsolutions-esempio.it'], iva: null, pn: null, dip: 5 },
  { rs: 'Agriturismo Le Colline', titolari: [['Franco', 'Bruno'], ['Anna', 'Bruno']], email: ['lecolline@esempio.it'], iva: 1, pn: 1, dip: 8, fatt: 520000 },
  { rs: 'Ferramenta Colombo', titolari: [['Giorgio', 'Colombo']], email: ['ferramenta.colombo@esempio.it'], iva: 1, pn: 3, dip: 3, fatt: 300000 },
  { rs: 'Gelateria Dolce Vita', titolari: [['Sara', 'Ricci']], email: ['dolcevita@esempio.it'], iva: 4, pn: 4, dip: 5, fatt: 260000 },
  { rs: 'Trasporti Veloci S.r.l.', titolari: [['Antonio', 'Gallo']], email: ['ufficio@trasportiveloci-esempio.it'], iva: 1, pn: 1, dip: 18, fatt: 2100000 },
  { rs: 'Farmacia San Marco', titolari: [['Elena', 'Conti']], email: ['farmaciasanmarco@esempio.it'], iva: 1, pn: 2, dip: 7, fatt: 1500000 },
  { rs: 'Parrucchieria Stile', titolari: [['Roberta', 'Costa']], email: [], iva: 2, pn: 5 },
  { rs: 'Officina Meccanica Fontana', titolari: [['Davide', 'Fontana']], email: ['officina.fontana@esempio.it'], iva: 1, pn: 1, dip: 4, fatt: 410000 },
  { rs: 'Libreria Pagine', titolari: [['Marco', 'Moretti']], email: ['libreriapagine@esempio.it'], iva: 3, pn: 3, dip: 2, fatt: 150000 },
  { rs: 'Auto Shop Due S.r.l.', titolari: [['Enzo', "D'Agosta"]], email: ['info@autoshop-esempio.it'], iva: 1, pn: 1, dip: 3, fatt: 300000 },
  { rs: 'Caseificio Valle Verde', titolari: [['Pietro', 'Rinaldi']], email: ['valleverde@esempio.it'], iva: 2, pn: 2, dip: 11, fatt: 980000 },
  { rs: 'Immobiliare Aurora', titolari: [['Laura', 'Galli']], email: ['aurora.immobiliare@esempio.it', 'aurora@pec-esempio.it'], iva: 1, pn: null },
  { rs: 'Pizzeria Da Gino', titolari: [['Gino', 'Esposito']], email: ['dagino@esempio.it'], iva: 6, pn: 7, dip: 6, fatt: 330000 },
  { rs: 'Consulenze Web di Serra Luca', titolari: [['Luca', 'Serra']], email: ['luca.serra@esempio.it'], iva: 'na', pn: 1, fatt: 45000 },
]

const CLIENTI_B: ClienteSeed[] = [
  { rs: 'Bianchi Arredamenti', titolari: [['Carlo', 'Bianchi']], email: ['arredamenti.bianchi@esempio.it'], iva: 1, pn: 1 },
  { rs: 'Lavanderia Bolla', titolari: [['Irene', 'Villa']], email: ['bolla@esempio.it'], iva: 3, pn: 2 },
  { rs: 'Macelleria Sartori', titolari: [['Bruno', 'Sartori']], email: [], iva: 1, pn: 4 },
  { rs: 'Vivaio Primavera', titolari: [['Nadia', 'Pellegrini']], email: ['vivaio.primavera@esempio.it'], iva: 2, pn: 2 },
  { rs: 'Cartoleria Arcobaleno', titolari: [['Fabio', 'Leone']], email: ['arcobaleno@esempio.it'], iva: null, pn: null },
  { rs: 'Palestra Energia', titolari: [['Silvia', 'Martini']], email: ['energia@esempio.it'], iva: 1, pn: 1 },
  { rs: 'Enoteca Il Calice', titolari: [['Riccardo', 'Mariani']], email: ['ilcalice@esempio.it'], iva: 5, pn: 5 },
  { rs: 'Tipografia Stampa Rapida', titolari: [['Monica', 'Ferrara']], email: ['stamparapida@esempio.it'], iva: 1, pn: 2 },
]

async function creaStudio(nome: string, dominio: string, persone: [string, string, 'admin' | 'collaboratore'][], clienti: ClienteSeed[]) {
  const ps: (P & { ruolo: string })[] = []
  for (const [n, c, r] of persone) {
    const semplice = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
    const email = `${semplice(n)}.${semplice(c)}@${dominio}`
    ps.push({ ...(await utenteAuth(email, n, c)), ruolo: r })
  }
  const titolare = ps[0]
  await come(titolare, (tx) => tx`select public.registra_studio(${nome}, ${titolare.nome}, ${titolare.cognome})`)
  const [{ studio_id }] = await sql<{ studio_id: string }[]>`select studio_id from public.utenti where id = ${titolare.id}`
  for (const p of ps.slice(1)) {
    await sql`insert into public.utenti (id, studio_id, nome, cognome, email, ruolo) values (${p.id}, ${studio_id}, ${p.nome}, ${p.cognome}, ${p.email}, ${p.ruolo})`
  }
  await sql`update public.utenti set onboarding_email_il = now() where studio_id = ${studio_id}`
  const collaboratori = ps.filter((p) => p.ruolo === 'collaboratore')

  const idClienti: string[] = []
  for (const [i, c] of clienti.entries()) {
    const nomeVis = `${c.rs.replace(/ (S\.r\.l\.s?\.|S\.p\.A\.|S\.a\.s\.)$/, '')} — ${c.titolari[0][0]} ${c.titolari[0][1]}`
    const [{ id }] = await come(titolare, (tx) => tx<{ id: string }[]>`
      insert into public.clienti (studio_id, ragione_sociale, nome_visualizzazione, numero_dipendenti, fatturato, partita_iva, creato_da)
      values (${studio_id}, ${c.rs}, ${nomeVis}, ${c.dip ?? null}, ${c.fatt ?? null}, ${c.piva ?? null}, ${titolare.id}) returning id`)
    idClienti.push(id)
    await come(titolare, async (tx) => {
      for (const [j, [n, cg]] of c.titolari.entries())
        await tx`insert into public.clienti_titolari (studio_id, cliente_id, nome, cognome, principale, ordine) values (${studio_id}, ${id}, ${n}, ${cg}, ${j === 0}, ${j})`
      for (const e of c.email)
        await tx`insert into public.clienti_email (studio_id, cliente_id, indirizzo, tipo, creato_da) values (${studio_id}, ${id}, ${e}, ${e.includes('pec') ? 'pec' : 'ordinaria'}, ${titolare.id})`
      await tx`select public.assegna_referente(${[id]}::uuid[], ${collaboratori[i % collaboratori.length].id})`
    })
    const ref = collaboratori[i % collaboratori.length]
    await come(ref, async (tx) => {
      await tx`select set_config('app.origine', 'importazione', true)`
      if (c.iva === 'na') await tx`select public.imposta_indicatore(${id}, 'iva', null, true)`
      else if (c.iva !== null) await tx`select public.imposta_indicatore(${id}, 'iva', ${fineMese(c.iva + 1)}::date, false)`
      if (c.pn !== null) await tx`select public.imposta_indicatore(${id}, 'prima_nota', ${fineMese(c.pn + 1)}::date, false)`
    })
    if (c.iva !== null && c.iva !== 'na' && i % 3 === 0) {
      await come(ref, (tx) => tx`select public.imposta_indicatore(${id}, 'iva', ${fineMese(c.iva as number)}::date, false)`)
    }
  }

  // comunicazioni a mano
  const esempi: [string, string][] = [
    ['telefono', 'Ha chiamato per sapere a che punto è la dichiarazione IVA. Richiamare entro venerdì.'],
    ['incontro', 'Incontro in studio: portati gli estratti conto di luglio e agosto. Mancano le fatture di un fornitore.'],
    ['email', 'Ha mandato le fatture di acquisto di settembre.'],
  ]
  for (const [i, id] of idClienti.slice(0, 6).entries()) {
    const ref = collaboratori[i % collaboratori.length]
    const [canale, testo] = esempi[i % esempi.length]
    await come(ref, (tx) => tx`insert into public.comunicazioni (studio_id, cliente_id, data, canale, testo, fonte, autore_id)
      values (${studio_id}, ${id}, now() - ${`${i + 1} days`}::interval, ${canale}, ${testo}, 'manuale', ${ref.id})`)
  }

  // compiti
  const compiti: [string, string, number, number | null, string][] = [
    ['Preparare il contratto di affitto', 'Contratto di locazione per il nuovo magazzino, bozza da controllare.', 0, 2, 'alta'],
    ['Verificare le cartelle da pagare', 'Controllare le cartelle esattoriali in scadenza nei prossimi 60 giorni e dare risposta al cliente.', 2, -1, 'urgente'],
    ['Inviare il riepilogo IVA del trimestre', '', 1, 0, 'normale'],
    ['Aggiornare la procedura interna delle F24', 'Lavoro generale dello studio.', -1, 7, 'normale'],
    ['Richiedere le fatture mancanti al fornitore', '', 4, null, 'normale'],
  ]
  const idCompiti: string[] = []
  for (const [i, [titolo, descr, cl, giorni, prio]] of compiti.entries()) {
    const a = collaboratori[i % collaboratori.length]
    const cliente = cl >= 0 ? idClienti[cl] : null
    const scad = giorni === null ? null : new Date(Date.now() + giorni * 86400000 + 3600000)
    const [{ id }] = await come(titolare, (tx) => tx<{ id: string }[]>`
      select public.crea_compito(${titolo}, ${descr}, ${cliente}, ${[a.id]}::uuid[], ${scad}, ${i === 0}, ${prio}) as id`)
    idCompiti.push(id)
  }
  const [c1, c2] = collaboratori
  await come(c1, async (tx) => {
    await tx`select public.cambia_stato_compito(${idCompiti[0]}, 'in_lavorazione')`
    await tx`select public.aggiungi_commento(${idCompiti[0]}, 'Il contratto è pronto, l''ho già visionato: ora va controllato.')`
    await tx`select public.cambia_stato_compito(${idCompiti[0]}, 'pronto_revisione')`
  })
  if (c2) await come(c2, (tx) => tx`select public.cambia_stato_compito(${idCompiti[1]}, 'in_lavorazione')`)
  return { studio_id, persone: ps }
}

async function main() {
  const esistente = await sql`select 1 from public.studi where nome = 'Studio Farruggio (demo)'`
  if (esistente.length && !process.argv.includes('--forza')) {
    console.log('Dati di esempio già presenti (usa --forza dopo aver ricreato il database).')
    return
  }
  const a = await creaStudio('Studio Farruggio (demo)', 'studio-demo.it', [
    ['Nicolò', 'Farruggio', 'admin'], ['Giulia', 'Verdi', 'collaboratore'], ['Marco', 'Russo', 'collaboratore'], ['Sofia', 'Romano', 'collaboratore'],
  ], CLIENTI_A)
  const b = await creaStudio('Studio Bianchi (demo)', 'bianchi-demo.it', [
    ['Paola', 'Bianchi', 'admin'], ['Luca', 'Testa', 'collaboratore'], ['Anna', 'De Luca', 'collaboratore'], ['Pietro', 'Longo', 'collaboratore'],
  ], CLIENTI_B)
  console.log('\nDati di esempio creati. Password di tutti gli utenti:', PASSWORD)
  for (const s of [a, b]) for (const p of s.persone) console.log(`  ${p.ruolo.padEnd(13)} ${p.email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => sql.end())
