import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { DEFAULT_TABLE_COLUMNS, type MasterCategory, type MasterItem } from '../types.ts';
import { OperationType, db, handleFirestoreError } from './firebase.ts';

interface SeedMasterDef {
  id: string;
  category: MasterCategory;
  name: string;
  parent_value: string | null;
  sort_order: number;
  is_active: boolean;
  is_terminal: boolean;
  terminal_outcome: 'won' | 'lost' | null;
  system_key: string | null;
}

export function buildDefaultMasterItems(): SeedMasterDef[] {
  const items: SeedMasterDef[] = [];
  const push = (
    category: MasterCategory,
    idx: number,
    name: string,
    opts?: Partial<Pick<SeedMasterDef, 'parent_value' | 'is_terminal' | 'terminal_outcome' | 'system_key'>>
  ) => {
    items.push({
      id: `${category}_${idx}`,
      category,
      name,
      parent_value: opts?.parent_value ?? null,
      sort_order: idx,
      is_active: true,
      is_terminal: Boolean(opts?.is_terminal),
      terminal_outcome: opts?.terminal_outcome ?? null,
      system_key: opts?.system_key ?? null,
    });
  };

  const stages: Array<{ name: string; terminal?: boolean; outcome?: 'won' | 'lost' | null; systemKey?: string }> = [
    { name: 'New Lead', systemKey: 'new_lead' },
    { name: 'Requirement Received', systemKey: 'requirement_received' },
    { name: 'Options Shared', systemKey: 'options_shared' },
    { name: 'Site Visit Planned', systemKey: 'site_visit_planned' },
    { name: 'Site Visit Done', systemKey: 'site_visit_done' },
    { name: 'Meeting Planned', systemKey: 'meeting_planned' },
    { name: 'Meeting Done', systemKey: 'meeting_done' },
    { name: 'Negotiation', systemKey: 'negotiation' },
    { name: 'Booking Done', terminal: true, outcome: 'won', systemKey: 'booking_done' },
    { name: 'Dead', terminal: true, outcome: 'lost', systemKey: 'dead' },
  ];
  stages.forEach((s, i) =>
    push('lead_stage', i + 1, s.name, {
      is_terminal: Boolean(s.terminal),
      terminal_outcome: s.outcome ?? null,
      system_key: s.systemKey ?? null,
    })
  );

  [
    'Walk-in',
    'Referral',
    'Cold Call',
    'Website',
    'Meta Lead Ads',
    '99acres',
    'Magicbricks',
    'Housing.com',
    'WhatsApp Inquiry',
    'Channel Partner',
    'Excel/CSV Import',
  ].forEach((n, i) => push('lead_source', i + 1, n));

  push('property_type', 1, 'Residential');
  push('property_type', 2, 'Commercial');

  ['Apartment', 'Bungalow', 'Tenament', 'Rowhouse', 'Penthouse', 'Weekend Home'].forEach((n, i) =>
    push('property_subtype', i + 1, n, { parent_value: 'Residential' })
  );
  items.push({
    id: 'property_subtype_residential_plot',
    category: 'property_subtype',
    name: 'Residential Plot',
    parent_value: 'Residential',
    sort_order: 7,
    is_active: true,
    is_terminal: false,
    terminal_outcome: null,
    system_key: null,
  });
  ['Office', 'Showroom', 'Other'].forEach((n, i) =>
    push('property_subtype', i + 7, n, { parent_value: 'Commercial' })
  );

  push('transaction_type', 1, 'Sale');
  push('transaction_type', 2, 'Rent');

  const baseLocalities = [
    'Satellite',
    'Prahlad Nagar',
    'Bodakdev',
    'Sindhu Bhavan Road',
    'Thaltej',
    'Vastrapur',
    'SG Highway',
    'Bopal',
    'South Bopal',
    'Shilaj',
    'Ambli',
    'Science City',
    'Gota',
    'Navrangpura',
    'CG Road',
    'Ashram Road',
    'Paldi',
    'Maninagar',
    'Chandkheda',
    'Vaishnodevi Circle',
    'Shela',
    'Ghuma',
    'Nikol',
    'GIFT City',
  ];

  const additionalAhmedabadLocalities = [
    '100 Feet Road',
    'Adalaj',
    'Ambawadi',
    'Ambli',
    'Ashram Road',
    'Bavla',
    'Bavlu',
    'Bhadaj',
    'Bhat',
    'Bhuyangdev',
    'Bodakdev',
    'Bopal',
    'CG Road',
    'Chanakyapuri',
    'Chandkheda',
    'Chandlodia',
    'Changodar',
    'Dholera',
    'Drive In Road',
    'Ellisbridge',
    'Gandhinagar',
    'Ghatlodia',
    'Ghuma',
    'Gift City',
    'Gota',
    'Gulbai Tekra',
    'Gurukul',
    'Hebatpur Road',
    'Income Tax',
    'Iscon Ambli Road',
    'Jagatpur',
    'Jivrajpark',
    'Jodhpur',
    'Juhapura',
    'Kalol',
    'Kasindra',
    'Koba',
    'Koteshwar',
    'Kudasan',
    'Law Garden',
    'Makarba',
    'Manekbaug',
    'Manipur',
    'Memnagar',
    'Mithakhali',
    'Motera',
    'Nana Chiloda',
    'Naranpura',
    'Navrangpura',
    'Nehru Nagar',
    'New CG Road',
    'New Ranip',
    'New Wadaj',
    'Nirnay Nagar',
    'Ognaj',
    'Other Area',
    'Paldi',
    'Palodia',
    'Pethapur',
    'Prahladnagar',
    'Ramdevnagar',
    'Rancharda',
    'Randesan',
    'Randheja',
    'Ranip',
    'Raysan',
    'Sabarmati',
    'Sanand',
    'Sanathal',
    'Santej',
    'Sargasan',
    'Sarkhej',
    'Satadhar',
    'Satellite',
    'Science City',
    'SG Road',
    'Shahibaug',
    'Shastrinagar',
    'Shela',
    'Shilaj',
    'Shivranjani',
    'Shyamal',
    'Sindhubhavan Road',
    'Sola',
    'South Bopal',
    'SP Ring Road',
    'Subhash Bridge',
    'Sughad',
    'Surdhara Circle',
    'Thaltej',
    'Thol',
    'Tragad',
    'Usmanpura',
    'Vaishno Devi',
    'Vasna',
    'Vastrapur',
    'Vavol',
    'Vejalpur',
    'Vijay Cross Road',
    'Wadaj',
    'Zundal',
    'Amraiwadi',
    'Asarwa',
    'Bapunagar',
    'Bhaipura',
    'CTM',
    'Dariyapur',
    'Ghodasar',
    'Gomtipur',
    'Hansol',
    'Hathijan',
    'Hatkeshwar',
    'India Colony',
    'Isanpur',
    'Jashoda Nagar',
    'Kankaria',
    'Kathwada',
    'Khokhra',
    'Kubernagar',
    'Lambha',
    'Maninagar',
    'Meghaninagar',
    'Naroda',
    'Naroda GIDC',
    'Nava Naroda',
    'New Maninagar',
    'Nikol',
    'Odhav',
    'Rabari Colony',
    'Rakhial',
    'Ramol',
    'Saijpur Bogha',
    'Sardarnagar',
    'Saraspur',
    'Thakkarbapa Nagar',
    'Vastral',
    'Vatva',
    'Vatva GIDC',
    'Vinzol',
    'Viratnagar',
  ];

  const seenLocalities = new Set<string>();
  baseLocalities.forEach((n, i) => {
    seenLocalities.add(n.trim().toLowerCase());
    push('locality', i + 1, n);
  });

  let nextLocalityOrder = baseLocalities.length + 1;
  for (const name of additionalAhmedabadLocalities) {
    const key = name.trim().toLowerCase();
    if (!key || seenLocalities.has(key)) continue;
    seenLocalities.add(key);
    const slug = key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    items.push({
      id: `locality_ahm_${slug}`,
      category: 'locality',
      name,
      parent_value: null,
      sort_order: nextLocalityOrder++,
      is_active: true,
      is_terminal: false,
      terminal_outcome: null,
      system_key: null,
    });
  }

  ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK'].forEach((n, i) => push('bhk_config', i + 1, n));

  [
    'Budget Issue',
    'Location Not Suitable',
    'Property Not Available',
    'Customer Not Interested',
    'Customer Not Responding',
    'Purchased/Rented from Other Consultant',
    'Requirement Cancelled',
    'Duplicate Lead',
    'Invalid Contact Details',
    'Other',
  ].forEach((n, i) => push('dead_reason', i + 1, n));

  ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'].forEach((n, i) => push('furnishing_type', i + 1, n));

  ['Ready to Move', 'Within 3 Months', 'Within 6 Months', 'Within 1 Year', 'Under Construction'].forEach((n, i) =>
    push('possession_pref', i + 1, n)
  );

  return items;
}

async function commitMasterItemsChunked(missing: SeedMasterDef[]): Promise<void> {
  const chunkSize = 400;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const slice = missing.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const m of slice) {
      batch.set(doc(db, 'masters', m.id), {
        id: m.id,
        category: m.category,
        name: m.name,
        parent_value: m.parent_value,
        sort_order: m.sort_order,
        is_active: m.is_active,
        is_terminal: m.is_terminal,
        terminal_outcome: m.terminal_outcome,
        system_key: m.system_key,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function ensureDefaultMastersSeeded(existingMasters: MasterItem[]): Promise<number> {
  const existingIds = new Set(existingMasters.map((m) => m.id));
  const existingNames = new Set(existingMasters.map((m) => `${m.category}::${m.name.trim().toLowerCase()}`));

  const maxOrderByCat = new Map<MasterCategory, number>();
  for (const m of existingMasters) {
    maxOrderByCat.set(m.category, Math.max(maxOrderByCat.get(m.category) ?? 0, m.sort_order));
  }

  const missing = buildDefaultMasterItems()
    .filter((m) => !existingIds.has(m.id) && !existingNames.has(`${m.category}::${m.name.trim().toLowerCase()}`))
    .map((m) => {
      const nextOrder = (maxOrderByCat.get(m.category) ?? 0) + 1;
      maxOrderByCat.set(m.category, nextOrder);
      return { ...m, sort_order: existingMasters.length > 0 ? nextOrder : m.sort_order };
    });

  if (missing.length === 0) return 0;

  try {
    await commitMasterItemsChunked(missing);
    return missing.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'masters');
  }
}

export async function ensureAdditionalLocalitiesSeeded(existingMasters: MasterItem[]): Promise<number> {
  const existingIds = new Set(existingMasters.map((m) => m.id));
  const existingLocalityNames = new Set(
    existingMasters
      .filter((m) => m.category === 'locality')
      .map((m) => m.name.trim().toLowerCase())
  );

  let nextOrder = existingMasters
    .filter((m) => m.category === 'locality')
    .reduce((mx, m) => Math.max(mx, m.sort_order), 0);

  const missing = buildDefaultMasterItems()
    .filter(
      (m) =>
        m.category === 'locality' &&
        !existingIds.has(m.id) &&
        !existingLocalityNames.has(m.name.trim().toLowerCase())
    )
    .map((m) => {
      nextOrder += 1;
      return { ...m, sort_order: nextOrder };
    });

  if (missing.length === 0) return 0;

  try {
    await commitMasterItemsChunked(missing);
    return missing.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'masters');
  }
}

export async function ensureAdditionalSubtypesSeeded(existingMasters: MasterItem[]): Promise<number> {
  const existingIds = new Set(existingMasters.map((m) => m.id));
  const existingSubtypeNames = new Set(
    existingMasters
      .filter((m) => m.category === 'property_subtype')
      .map((m) => m.name.trim().toLowerCase())
  );

  let nextOrder = existingMasters
    .filter((m) => m.category === 'property_subtype')
    .reduce((mx, m) => Math.max(mx, m.sort_order), 0);

  const missing = buildDefaultMasterItems()
    .filter(
      (m) =>
        m.category === 'property_subtype' &&
        !existingIds.has(m.id) &&
        !existingSubtypeNames.has(m.name.trim().toLowerCase())
    )
    .map((m) => {
      nextOrder += 1;
      return { ...m, sort_order: nextOrder };
    });

  if (missing.length === 0) return 0;

  try {
    await commitMasterItemsChunked(missing);
    return missing.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'masters');
  }
}

export async function bootstrapFirebaseWorkspace(params: {
  uid: string;
  email: string;
  full_name: string;
  mobile: string;
  include_sample_data: boolean;
}): Promise<void> {
  const emailLower = params.email.trim().toLowerCase();
  const sampleCount = params.include_sample_data ? 8 : 0;

  // Batch 1: Core user profile, admin lookup, directory entry, and workspace settings
  try {
    const b1 = writeBatch(db);
    b1.set(doc(db, 'users', params.uid), {
      uid: params.uid,
      email: emailLower,
      full_name: params.full_name.trim().slice(0, 120),
      mobile: params.mobile.trim().slice(0, 20),
      designation: 'Principal Consultant & Admin',
      role: 'super_admin',
      status: 'active',
      profile_photo: null,
      theme_preference: 'light',
      lead_view_preference: 'table',
      page_size_preference: 25,
      table_columns_preference: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    b1.set(doc(db, 'admins', params.uid), {
      uid: params.uid,
      email: emailLower,
      grantedBy: params.uid,
      createdAt: serverTimestamp(),
    });
    b1.set(doc(db, 'employeeDirectory', params.uid), {
      id: params.uid,
      uid: params.uid,
      email_key: emailLower,
      full_name: params.full_name.trim().slice(0, 120),
      designation: 'Principal Consultant & Admin',
      role: 'super_admin',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    b1.set(doc(db, 'settings', 'workspace'), {
      company_name: 'Shreeji Space Management CRM',
      short_name: 'SSM CRM',
      company_logo: null,
      default_table_columns: DEFAULT_TABLE_COLUMNS,
      lead_seq: sampleCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await b1.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'workspace-bootstrap-core');
  }

  // Batch 2: Seed all 10 PRD Master categories
  try {
    const b2 = writeBatch(db);
    for (const m of buildDefaultMasterItems()) {
      b2.set(doc(db, 'masters', m.id), {
        id: m.id,
        category: m.category,
        name: m.name,
        parent_value: m.parent_value,
        sort_order: m.sort_order,
        is_active: m.is_active,
        is_terminal: m.is_terminal,
        terminal_outcome: m.terminal_outcome,
        system_key: m.system_key,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await b2.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'masters');
  }

  if (!params.include_sample_data) return;

  // Batch 3: Seed sample Sales Executive invites, directory entries, 8 Ahmedabad leads, and activities
  try {
    const now = new Date();
    const isoDaysAgo = (days: number, hourOffset = 10) => {
      const d = new Date(now.getTime() - days * 86400000);
      d.setHours(hourOffset, 30, 0, 0);
      return d.toISOString();
    };
    const isoHoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3600000).toISOString();
    const datePart = (iso: string) => iso.slice(0, 10);
    const timePart = (iso: string) => iso.slice(11, 16);

    const sampleExecs = [
      {
        id: 'emp_sample_aarav',
        email: 'aarav.patel@shreejispace.in',
        full_name: 'Aarav Patel',
        mobile: '9825011223',
        designation: 'Senior Property Consultant',
      },
      {
        id: 'emp_sample_priya',
        email: 'priya.shah@shreejispace.in',
        full_name: 'Priya Shah',
        mobile: '9898022334',
        designation: 'Commercial Leasing Specialist',
      },
      {
        id: 'emp_sample_rohan',
        email: 'rohan.mehta@shreejispace.in',
        full_name: 'Rohan Mehta',
        mobile: '9724033445',
        designation: 'Residential Advisor',
      },
    ];

    const b3 = writeBatch(db);
    for (const ex of sampleExecs) {
      b3.set(doc(db, 'employeeInvites', ex.id), {
        id: ex.id,
        email: ex.email,
        full_name: ex.full_name,
        mobile: ex.mobile,
        designation: ex.designation,
        role: 'sales_executive',
        status: 'active',
        claimed_uid: null,
        createdBy: params.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      b3.set(doc(db, 'employeeDirectory', ex.id), {
        id: ex.id,
        uid: null,
        email_key: ex.email,
        full_name: ex.full_name,
        designation: ex.designation,
        role: 'sales_executive',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const sampleLeads = [
      {
        customer_name: 'Karanvir Desai',
        mobile: '9825044556',
        alternate_mobile: '9825044557',
        whatsapp: '9825044556',
        email: 'karan.desai@example.in',
        company_name: 'Desai Textiles Pvt Ltd',
        lead_source: '99acres',
        property_type: 'Residential',
        property_subtype: 'Apartment',
        transaction_type: 'Sale',
        localities: ['Bodakdev', 'Sindhu Bhavan Road'],
        budget_from: 18500000,
        budget_to: 24000000,
        min_area: 2200,
        max_area: 2800,
        area_unit: 'Sq. Ft.',
        bhk_config: '4 BHK',
        furnishing_type: 'Semi-Furnished',
        preferred_floor: 'High Floor (8th+)',
        possession_pref: 'Ready to Move',
        stage: 'Negotiation',
        exec: sampleExecs[0],
        created_days_ago: 12,
        last_interaction_days_ago: 1,
        last_interaction_type: 'Meeting Completed',
        last_interaction_remarks: 'Discussed final payment schedule at Skyview Residency.',
      },
      {
        customer_name: 'Nidhi Parikh',
        mobile: '9898055667',
        whatsapp: '9898055667',
        email: 'nidhi.p@medcraft.in',
        company_name: 'MedCraft Diagnostics',
        lead_source: 'Website',
        property_type: 'Commercial',
        property_subtype: 'Office',
        transaction_type: 'Rent',
        localities: ['Prahlad Nagar', 'SG Highway'],
        budget_from: 95000,
        budget_to: 145000,
        min_area: 1800,
        max_area: 2500,
        area_unit: 'Sq. Ft.',
        commercial_config: 'Corporate Executive Suite',
        furnishing_type: 'Fully Furnished',
        preferred_floor: 'Mid Floor',
        possession_pref: 'Within 3 Months',
        required_workstations: 24,
        required_cabins: 3,
        stage: 'Site Visit Planned',
        exec: sampleExecs[1],
        created_days_ago: 6,
        last_interaction_days_ago: 2,
        last_interaction_type: 'Follow-up Call Completed',
        last_interaction_remarks: 'Confirmed shortlist for Mondeal Heights & Pinnacle.',
      },
      {
        customer_name: 'Harshvardhan Zaveri',
        mobile: '9824066778',
        whatsapp: '9824066778',
        email: 'harsh@zaverijewels.in',
        company_name: 'Zaveri Heritage Jewels',
        lead_source: 'Referral',
        property_type: 'Commercial',
        property_subtype: 'Showroom',
        transaction_type: 'Sale',
        localities: ['CG Road', 'Sindhu Bhavan Road'],
        budget_from: 65000000,
        budget_to: 85000000,
        min_area: 3000,
        max_area: 4200,
        area_unit: 'Sq. Ft.',
        commercial_config: 'Ground + Mezzanine Frontage',
        furnishing_type: 'Unfurnished',
        preferred_floor: 'Ground Floor',
        possession_pref: 'Ready to Move',
        required_workstations: 8,
        required_cabins: 2,
        stage: 'Booking Done',
        exec: sampleExecs[1],
        created_days_ago: 28,
        last_interaction_days_ago: 4,
        last_interaction_type: 'Meeting Completed',
        last_interaction_remarks: 'Token cheque cleared and booking agreement executed.',
        booking: {
          booking_date: datePart(isoDaysAgo(4)),
          booking_project_name: 'The Atelier SBR Commercial',
          final_transaction_amount: 74500000,
          brokerage_amount: 1490000,
          brokerage_percentage: 2.0,
          payment_status: 'Partially Paid' as const,
          booking_remarks: '50% brokerage received on agreement; balance on registration.',
        },
      },
      {
        customer_name: 'Meera & Siddharth Kothari',
        mobile: '9879077889',
        whatsapp: '9879077889',
        email: 'siddharth.k@kothariarch.in',
        lead_source: 'Magicbricks',
        property_type: 'Residential',
        property_subtype: 'Bungalow',
        transaction_type: 'Sale',
        localities: ['Ambli', 'Shilaj'],
        budget_from: 52000000,
        budget_to: 70000000,
        min_area: 450,
        max_area: 650,
        area_unit: 'Sq. Yards (Vaar)',
        bhk_config: '5 BHK',
        furnishing_type: 'Semi-Furnished',
        possession_pref: 'Ready to Move',
        stage: 'Options Shared',
        exec: sampleExecs[0],
        created_days_ago: 24,
        last_interaction_days_ago: 17,
        last_interaction_type: 'WhatsApp Follow-up Completed',
        last_interaction_remarks: 'Shared 3 bungalow brochures in Ambli Bopal Road.',
      },
      {
        customer_name: 'Devang Bhatt',
        mobile: '9909088990',
        email: 'devang.bhatt@fintechahm.com',
        lead_source: 'Meta Lead Ads',
        property_type: 'Residential',
        property_subtype: 'Apartment',
        transaction_type: 'Sale',
        localities: ['South Bopal', 'Shela'],
        budget_from: 7200000,
        budget_to: 9500000,
        min_area: 1450,
        max_area: 1850,
        area_unit: 'Sq. Ft.',
        bhk_config: '3 BHK',
        furnishing_type: 'Unfurnished',
        possession_pref: 'Within 6 Months',
        stage: 'Requirement Received',
        exec: sampleExecs[2],
        created_days_ago: 26,
        last_interaction_days_ago: 23,
        last_interaction_type: 'Follow-up Call Completed',
        last_interaction_remarks: 'Asked to reconnect after family discussion.',
      },
      {
        customer_name: 'Ananya Trivedi',
        mobile: '9725099001',
        whatsapp: '9725099001',
        lead_source: 'Housing.com',
        property_type: 'Residential',
        property_subtype: 'Penthouse',
        transaction_type: 'Sale',
        localities: ['Thaltej', 'Satellite'],
        budget_from: 31000000,
        budget_to: 42000000,
        min_area: 3400,
        max_area: 4100,
        area_unit: 'Sq. Ft.',
        bhk_config: '4 BHK',
        furnishing_type: 'Fully Furnished',
        possession_pref: 'Ready to Move',
        stage: 'New Lead',
        exec: sampleExecs[2],
        created_days_ago: 1,
        last_interaction_days_ago: 1,
        last_interaction_type: null,
        last_interaction_remarks: null,
      },
      {
        customer_name: 'Pratiksha Amin',
        mobile: '9825101122',
        lead_source: 'Walk-in',
        property_type: 'Residential',
        property_subtype: 'Apartment',
        transaction_type: 'Rent',
        localities: ['Vastrapur', 'Navrangpura'],
        budget_from: 35000,
        budget_to: 48000,
        min_area: 1350,
        max_area: 1650,
        area_unit: 'Sq. Ft.',
        bhk_config: '3 BHK',
        furnishing_type: 'Fully Furnished',
        possession_pref: 'Ready to Move',
        stage: 'Dead',
        exec: sampleExecs[0],
        created_days_ago: 19,
        last_interaction_days_ago: 9,
        last_interaction_type: 'Follow-up Call Completed',
        last_interaction_remarks: 'Client finalized flat near IIM directly through owner.',
        dead: {
          dead_reason: 'Purchased/Rented from Other Consultant',
          dead_remarks: 'Took possession in Vastrapur directly; polite closure.',
        },
      },
      {
        customer_name: 'Karanvir Desai',
        mobile: '9825044556',
        whatsapp: '9825044556',
        email: 'karan.desai@example.in',
        company_name: 'Desai Textiles Pvt Ltd',
        lead_source: 'Channel Partner',
        property_type: 'Commercial',
        property_subtype: 'Office',
        transaction_type: 'Sale',
        localities: ['SG Highway', 'GIFT City'],
        budget_from: 22000000,
        budget_to: 30000000,
        min_area: 2500,
        max_area: 3200,
        area_unit: 'Sq. Ft.',
        commercial_config: 'Bare-Shell Corporate Floor',
        furnishing_type: 'Unfurnished',
        possession_pref: 'Within 1 Year',
        required_workstations: 35,
        required_cabins: 4,
        stage: 'Meeting Done',
        exec: sampleExecs[1],
        created_days_ago: 5,
        last_interaction_days_ago: 0,
        last_interaction_type: 'Meeting Completed',
        last_interaction_remarks: 'Reviewed developer floor plans for SG Highway tower.',
      },
    ];

    const leadIds: string[] = [];
    const leadCodes: string[] = [];

    sampleLeads.forEach((item, idx) => {
      const seq = idx + 1;
      const code = `SSM-${String(seq).padStart(6, '0')}`;
      const leadId = `SSM_${String(seq).padStart(6, '0')}`;
      leadIds.push(leadId);
      leadCodes.push(code);

      const createdIso = isoDaysAgo(item.created_days_ago);
      const lastIntIso = isoDaysAgo(item.last_interaction_days_ago);
      const isTerminal = item.stage === 'Booking Done' || item.stage === 'Dead';
      const isInactive = !isTerminal && item.last_interaction_days_ago >= 15;
      const escalated = !isTerminal && item.last_interaction_days_ago >= 22;

      b3.set(doc(db, 'leads', leadId), {
        id: leadId,
        lead_code: code,
        customer_name: item.customer_name,
        mobile: item.mobile,
        alternate_mobile: item.alternate_mobile || null,
        whatsapp: item.whatsapp || null,
        email: item.email || null,
        company_name: item.company_name || null,
        customer_remarks: null,
        lead_source: item.lead_source,
        property_type: item.property_type,
        property_subtype: item.property_subtype,
        transaction_type: item.transaction_type,
        localities: item.localities,
        budget_from: item.budget_from,
        budget_to: item.budget_to,
        min_area: item.min_area,
        max_area: item.max_area,
        area_unit: item.area_unit,
        bhk_config: item.bhk_config || null,
        commercial_config: item.commercial_config || null,
        furnishing_type: item.furnishing_type || null,
        preferred_floor: item.preferred_floor || null,
        possession_pref: item.possession_pref || null,
        required_workstations: item.required_workstations ?? null,
        required_cabins: item.required_cabins ?? null,
        requirement_remarks: null,
        stage: item.stage,
        is_terminal_stage: isTerminal,
        created_by: params.uid,
        created_by_name: params.full_name.trim(),
        assigned_to: item.exec.id,
        assigned_to_uid: null,
        assigned_to_email: item.exec.email,
        assigned_to_name: item.exec.full_name,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deleted_by_name: null,
        is_inactive: isInactive,
        inactive_since: isInactive ? isoDaysAgo(item.last_interaction_days_ago - 15) : null,
        last_qualifying_interaction_at: lastIntIso,
        last_interaction_type: item.last_interaction_type,
        last_interaction_remarks: item.last_interaction_remarks,
        inactivity_notified_15: isInactive,
        inactivity_escalated_22: escalated,
        booking_date: item.booking?.booking_date || null,
        booking_project_name: item.booking?.booking_project_name || null,
        final_transaction_amount: item.booking?.final_transaction_amount ?? null,
        brokerage_amount: item.booking?.brokerage_amount ?? null,
        brokerage_percentage: item.booking?.brokerage_percentage ?? null,
        payment_status: item.booking?.payment_status ?? null,
        booking_remarks: item.booking?.booking_remarks || null,
        dead_reason: item.dead?.dead_reason || null,
        dead_remarks: item.dead?.dead_remarks || null,
        dead_by: item.dead ? item.exec.id : null,
        dead_by_name: item.dead ? item.exec.full_name : null,
        dead_at: item.dead ? isoDaysAgo(9) : null,
        import_batch_ref: null,
        created_date_iso: createdIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      b3.set(doc(db, 'mobileLookup', item.mobile, 'matches', leadId), {
        lead_id: leadId,
        lead_code: code,
        mobile: item.mobile,
        customer_name: item.customer_name,
        requirement_summary: `${item.property_subtype} · ${item.transaction_type}`,
        stage: item.stage,
        assigned_to: item.exec.id,
        assigned_to_name: item.exec.full_name,
        is_deleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const tlId = `tl_seed_${seq}`;
      b3.set(doc(db, 'leads', leadId, 'timeline', tlId), {
        id: tlId,
        lead_id: leadId,
        event_type: 'Lead Created',
        description: `Lead ${code} created for ${item.customer_name} (${item.property_subtype} - ${item.transaction_type})`,
        employee_id: params.uid,
        employee_name: params.full_name.trim(),
        createdAt: serverTimestamp(),
      });

      const alId = `audit_seed_${seq}`;
      b3.set(doc(db, 'auditLogs', alId), {
        id: alId,
        entity_type: 'lead',
        entity_id: leadId,
        lead_id: leadId,
        lead_code: code,
        lead_assigned_to_email: item.exec.email,
        action_type: 'Created',
        field_name: 'lead_code',
        previous_value: null,
        new_value: code,
        remarks: 'Initial sample workspace lead',
        employee_id: params.uid,
        employee_name: params.full_name.trim(),
        createdAt: serverTimestamp(),
      });
    });

    const todayPlus2h = isoHoursFromNow(2);
    const yesterday = isoDaysAgo(1, 15);
    const tomorrow = isoHoursFromNow(26);
    const twoDaysAgo = isoDaysAgo(2, 11);

    const sampleActs = [
      {
        id: 'act_seed_1',
        leadIdx: 0,
        type: 'Follow-up Call',
        iso: todayPlus2h,
        exec: sampleExecs[0],
        desc: 'Confirm final token cheque handover date with Karanvir Desai.',
        status: 'Pending',
        completedAt: null,
        completionRemarks: null,
      },
      {
        id: 'act_seed_2',
        leadIdx: 1,
        type: 'Site Visit',
        iso: tomorrow,
        exec: sampleExecs[1],
        desc: 'Site visit at Mondeal Heights & Pinnacle Prahlad Nagar.',
        status: 'Pending',
        completedAt: null,
        completionRemarks: null,
      },
      {
        id: 'act_seed_3',
        leadIdx: 5,
        type: 'WhatsApp Follow-up',
        iso: yesterday,
        exec: sampleExecs[2],
        desc: 'Send curated Thaltej & Satellite penthouse deck.',
        status: 'Pending',
        completedAt: null,
        completionRemarks: null,
      },
      {
        id: 'act_seed_4',
        leadIdx: 7,
        type: 'Meeting',
        iso: twoDaysAgo,
        exec: sampleExecs[1],
        desc: 'Developer pricing presentation for SG Highway office floor.',
        status: 'Completed',
        completedAt: twoDaysAgo,
        completionRemarks: 'Client liked 11th floor East-facing layout; asked for floor plate PDF.',
      },
    ];

    for (const a of sampleActs) {
      const lead = sampleLeads[a.leadIdx];
      const leadId = leadIds[a.leadIdx];
      const leadCode = leadCodes[a.leadIdx];
      b3.set(doc(db, 'activities', a.id), {
        id: a.id,
        lead_id: leadId,
        lead_code: leadCode,
        customer_name: lead.customer_name,
        customer_mobile: lead.mobile,
        lead_stage: lead.stage,
        lead_is_deleted: false,
        activity_type: a.type,
        scheduled_date: datePart(a.iso),
        scheduled_time: timePart(a.iso),
        scheduled_at: a.iso,
        assigned_to: a.exec.id,
        assigned_to_uid: null,
        assigned_to_email: a.exec.email,
        assigned_to_name: a.exec.full_name,
        description: a.desc,
        status: a.status,
        completed_by: a.status === 'Completed' ? a.exec.id : null,
        completed_by_name: a.status === 'Completed' ? a.exec.full_name : null,
        completed_at: a.completedAt,
        completion_remarks: a.completionRemarks,
        cancelled_by: null,
        cancelled_by_name: null,
        cancelled_at: null,
        cancel_reason: null,
        reschedule_count: 0,
        previous_schedule_history: [],
        reminded_30: false,
        reminded_15: false,
        reminded_overdue: false,
        created_by: params.uid,
        created_by_name: params.full_name.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await b3.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sample-workspace-seed');
  }
}
