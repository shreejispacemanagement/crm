import { AlertTriangle, ExternalLink, Search, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, formatAmountInWords, formatDateOnly, generateBudgetOptions } from '../lib/api.ts';
import { AREA_UNITS, type DuplicateMatch, type MasterItem, type UserProfile } from '../types.ts';

const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentTimeStr = () => {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const SHOWROOM_FLOORS = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];

interface LeadFormModalProps {
  currentUser: UserProfile;
  users: UserProfile[];
  masters: MasterItem[];
  onClose: () => void;
  onCreated: (leadId: string) => void;
  onOpenExistingLead: (leadId: string) => void;
}

export const LeadFormModal: React.FC<LeadFormModalProps> = ({
  currentUser,
  users,
  masters,
  onClose,
  onCreated,
  onOpenExistingLead,
}) => {
  const activeByCat = (cat: string) => masters.filter((m) => m.category === cat && m.is_active === 1);

  const sources = activeByCat('lead_source');
  const propertyTypes = activeByCat('property_type');
  const transactionTypes = activeByCat('transaction_type');
  const localitiesMaster = activeByCat('locality');
  const bhkMaster = activeByCat('bhk_config');
  const furnishingMaster = activeByCat('furnishing_type');
  const possessionMaster = activeByCat('possession_pref');
  const activeEmployees = users.filter((u) => u.status === 'active');

  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [altMobile, setAltMobile] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerRemarks, setCustomerRemarks] = useState('');

  const [leadSource, setLeadSource] = useState(sources[0]?.name || 'Walk-in');
  const [assignedTo, setAssignedTo] = useState(String(currentUser.id));

  const [propertyType, setPropertyType] = useState(propertyTypes[0]?.name || 'Residential');
  const subtypes = useMemo(
    () => activeByCat('property_subtype').filter((s) => !s.parent_value || s.parent_value === propertyType),
    [masters, propertyType]
  );
  const [propertySubtype, setPropertySubtype] = useState(subtypes[0]?.name || '');
  const [transactionType, setTransactionType] = useState(transactionTypes[0]?.name || 'Sale');

  const [selectedLocalities, setSelectedLocalities] = useState<string[]>([]);
  const [localitySearch, setLocalitySearch] = useState('');

  const [budgetFrom, setBudgetFrom] = useState('');
  const [budgetTo, setBudgetTo] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [areaUnit, setAreaUnit] = useState<string>('Sq. Ft.');

  const [bhkConfig, setBhkConfig] = useState('');
  const [commercialConfig, setCommercialConfig] = useState('');
  const [furnishingType, setFurnishingType] = useState('');
  const [preferredFloor, setPreferredFloor] = useState('');
  const [possessionPref, setPossessionPref] = useState('');
  const [reqWorkstations, setReqWorkstations] = useState('');
  const [reqCabins, setReqCabins] = useState('');
  const [requirementRemarks, setRequirementRemarks] = useState('');

  // Default follow-up date to today and time to current time
  const [firstFollowupType, setFirstFollowupType] = useState('Follow-up Call');
  const [firstFollowupDate, setFirstFollowupDate] = useState(getTodayDateStr);
  const [firstFollowupTime, setFirstFollowupTime] = useState(getCurrentTimeStr);
  const [firstFollowupRemarks, setFirstFollowupRemarks] = useState('');

  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budgetOptions = useMemo(() => generateBudgetOptions(transactionType), [transactionType]);

  useEffect(() => {
    if (subtypes.length > 0 && !subtypes.some((s) => s.name === propertySubtype)) {
      setPropertySubtype(subtypes[0].name);
    }
  }, [propertyType, subtypes, propertySubtype]);

  useEffect(() => {
    if (propertySubtype.trim().toLowerCase() === 'showroom') {
      if (!preferredFloor || !SHOWROOM_FLOORS.includes(preferredFloor)) {
        setPreferredFloor('Ground Floor');
      }
    }
  }, [propertySubtype, preferredFloor]);

  // Real-time duplicate primary mobile detection across active and deleted leads (PRD 3.6)
  useEffect(() => {
    if (/^[6-9]\d{9}$/.test(mobile)) {
      apiFetch<{ duplicates: DuplicateMatch[] }>(`/api/leads/check-duplicate?mobile=${mobile}`)
        .then((res) => setDuplicates(res.duplicates))
        .catch(() => setDuplicates([]));
    } else {
      setDuplicates([]);
    }
  }, [mobile]);

  const filteredLocalities = localitiesMaster.filter(
    (l) => !selectedLocalities.includes(l.name) && l.name.toLowerCase().includes(localitySearch.toLowerCase())
  );

  const toggleLocality = (name: string) => {
    setSelectedLocalities((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ lead: { id: string } }>('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName,
          mobile,
          alternate_mobile: altMobile || null,
          whatsapp: whatsapp || null,
          email: email || null,
          company_name: companyName || null,
          customer_remarks: customerRemarks || null,
          lead_source: leadSource,
          assigned_to: currentUser.role === 'super_admin' ? assignedTo : currentUser.id,
          property_type: propertyType,
          property_subtype: propertySubtype,
          transaction_type: transactionType,
          localities: selectedLocalities,
          budget_from: budgetFrom ? Number(budgetFrom) : null,
          budget_to: budgetTo ? Number(budgetTo) : null,
          min_area: minArea ? Number(minArea) : null,
          max_area: maxArea ? Number(maxArea) : null,
          area_unit: minArea || maxArea ? areaUnit : null,
          bhk_config: propertyType === 'Residential' ? bhkConfig || null : null,
          commercial_config: propertyType === 'Commercial' ? commercialConfig || null : null,
          furnishing_type: furnishingType || null,
          preferred_floor: preferredFloor || null,
          possession_pref: possessionPref || null,
          required_workstations: propertyType === 'Commercial' && reqWorkstations ? Number(reqWorkstations) : null,
          required_cabins: propertyType === 'Commercial' && reqCabins ? Number(reqCabins) : null,
          requirement_remarks: requirementRemarks || null,
          first_followup_type: firstFollowupType,
          first_followup_date: firstFollowupDate || null,
          first_followup_time: firstFollowupTime || null,
          first_followup_remarks: firstFollowupRemarks || null,
        }),
      });
      onCreated(res.lead.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 overflow-y-auto">
      <div className="my-6 w-full max-w-3xl rounded-xl border border-[#E2E8F0] bg-white dark:border-[#1E3349] dark:bg-[#121E2C]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E3349]">
          <div>
            <h2 className="text-lg font-semibold text-[#16273A] dark:text-white">Create New Lead</h2>
            <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
              One lead represents one specific property requirement · Auto-generates sequential SSM ID
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[#737373] hover:bg-[#FBF6EE] dark:hover:bg-[#1A2C40]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Section 1: Customer Information */}
          <div>
            <h3 className="text-xs font-semibold text-[#C99B56] mb-3">01. Customer Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                  Primary Mobile (10-digit) *
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="9825012345"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Alternate Mobile</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={altMobile}
                  onChange={(e) => setAltMobile(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4]">
                    WhatsApp Number
                  </label>
                  <button
                    type="button"
                    onClick={() => setWhatsapp(mobile)}
                    disabled={!mobile}
                    className="inline-flex items-center gap-1 rounded bg-[#FBF6EE] px-2 py-0.5 text-[10px] font-semibold text-[#B88B43] hover:bg-[#E8D5B7] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-[#2A2318] dark:text-[#C99B56] dark:hover:bg-[#382F20] transition-colors cursor-pointer"
                    title="Fill WhatsApp with primary mobile number"
                  >
                    Same as Primary
                  </button>
                </div>
                <input
                  type="tel"
                  maxLength={10}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                  placeholder="9825012345"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
            </div>

            {/* Duplicate Warning Banner (PRD 3.6 - Warn, do not block) */}
            {duplicates.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50 p-3.5 dark:bg-amber-950/25">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                      Duplicate Mobile Detected ({duplicates.length} existing record{duplicates.length > 1 ? 's' : ''})
                    </p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                      You can open an existing lead (if authorized) or continue creating a separate property requirement.
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {duplicates.map((d) => {
                        const canOpen =
                          d.is_deleted === 0 && (currentUser.role === 'super_admin' || d.assigned_to === currentUser.id);
                        return (
                          <div
                            key={d.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-white/80 px-2.5 py-1.5 text-xs dark:bg-[#121E2C]"
                          >
                            <div className="min-w-0">
                              <span className="font-mono-tabular font-semibold text-[#16273A] dark:text-white">{d.lead_code}</span>
                              <span className="mx-1.5 text-[#737373]">·</span>
                              <span className="font-medium text-[#16273A] dark:text-white">{d.customer_name}</span>
                              <span className="mx-1.5 text-[#737373]">·</span>
                              <span className="text-[#525252] dark:text-[#A3A3A3]">{d.requirement_summary}</span>
                              <span className="mx-1.5 text-[#737373]">·</span>
                              <span className="text-[#525252] dark:text-[#A3A3A3]">{d.stage}</span>
                              <span className="mx-1.5 text-[#737373]">·</span>
                              <span className="text-[#525252] dark:text-[#A3A3A3]">
                                {d.assigned_to_name} ({formatDateOnly(d.created_at)})
                              </span>
                              {d.is_deleted === 1 && (
                                <span className="ml-2 text-red-600 font-medium">[Deleted]</span>
                              )}
                            </div>
                            {canOpen && (
                              <button
                                type="button"
                                onClick={() => onOpenExistingLead(d.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#C99B56] hover:underline whitespace-nowrap shrink-0"
                              >
                                Open Lead <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-3.5">
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Lead Source *</label>
                <select
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {currentUser.role === 'super_admin' && (
                <div>
                  <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Assign To *</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                  >
                    {activeEmployees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={currentUser.role === 'super_admin' ? '' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Customer Remarks</label>
                <input
                  type="text"
                  value={customerRemarks}
                  onChange={(e) => setCustomerRemarks(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Property Requirement */}
          <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E3349]">
            <h3 className="text-xs font-semibold text-[#C99B56] mb-3">02. Property Requirement</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Property Type *</label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  {propertyTypes.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Property Subtype *</label>
                <select
                  value={propertySubtype}
                  onChange={(e) => setPropertySubtype(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  {subtypes.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Transaction Type *</label>
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  {transactionTypes.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Searchable Multi-Select Ahmedabad Localities (PRD 4.5) */}
            <div className="mt-3.5">
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                Preferred Ahmedabad Localities * (Selected appear as tags)
              </label>
              <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 dark:border-[#1E3349] dark:bg-[#0C141E]">
                {selectedLocalities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedLocalities.map((loc) => (
                      <span
                        key={loc}
                        className="inline-flex items-center gap-1 rounded-md bg-[#FBF6EE] px-2 py-0.5 text-xs font-medium text-[#16273A] dark:bg-[#2A2318] dark:text-[#FBF6EE]"
                      >
                        {loc}
                        <button
                          type="button"
                          onClick={() => toggleLocality(loc)}
                          className="text-[#737373] hover:text-red-600"
                          aria-label={`Remove ${loc}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#737373]" />
                  <input
                    type="text"
                    value={localitySearch}
                    onChange={(e) => setLocalitySearch(e.target.value)}
                    placeholder="Search Ahmedabad localities (e.g., Bodakdev, Satellite, SBR)..."
                    className="w-full rounded-md border border-[#E2E8F0]/60 bg-[#F8FAFC] py-1.5 pl-8 pr-3 text-xs text-[#16273A] focus:border-[#C99B56] focus:outline-none dark:border-[#1E3349] dark:bg-[#1A1A1A] dark:text-white"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {filteredLocalities.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => toggleLocality(loc.name)}
                      className="rounded-md border border-[#E2E8F0] px-2 py-1 text-xs text-[#404040] hover:border-[#C99B56] hover:bg-[#FBF6EE]/60 dark:border-[#1E3349] dark:text-[#D4D4D4] dark:hover:bg-[#1A2C40] whitespace-nowrap"
                    >
                      + {loc.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Budget Section with Dropdown, Custom Input & Amount in Words */}
            <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 dark:border-[#1E3349] dark:bg-[#181818]">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-2.5">
                <span className="text-xs font-semibold text-[#16273A] dark:text-white">
                  Budget ({transactionType})
                </span>
                <span className="text-[11px] text-[#737373] dark:text-[#A3A3A3]">
                  Select from preset dropdown or type custom amount
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Budget From */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4]">
                      Budget From (INR)
                    </label>
                    {budgetFrom && Number(budgetFrom) > 0 && (
                      <span className="text-[11px] font-semibold text-[#C99B56] dark:text-[#C99B56]">
                        {Number(budgetFrom).toLocaleString('en-IN')} ({formatAmountInWords(budgetFrom)})
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={budgetOptions.some((o) => o.value === Number(budgetFrom)) ? budgetFrom : ''}
                      onChange={(e) => {
                        if (e.target.value) setBudgetFrom(e.target.value);
                      }}
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-2 text-xs text-[#16273A] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    >
                      <option value="">Select Preset...</option>
                      {budgetOptions.map((opt) => (
                        <option key={`from-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={budgetFrom}
                      onChange={(e) => setBudgetFrom(e.target.value)}
                      placeholder="Or enter amount..."
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    />
                  </div>
                </div>

                {/* Budget To */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4]">
                      Budget To (INR)
                    </label>
                    {budgetTo && Number(budgetTo) > 0 && (
                      <span className="text-[11px] font-semibold text-[#C99B56] dark:text-[#C99B56]">
                        {Number(budgetTo).toLocaleString('en-IN')} ({formatAmountInWords(budgetTo)})
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={budgetOptions.some((o) => o.value === Number(budgetTo)) ? budgetTo : ''}
                      onChange={(e) => {
                        if (e.target.value) setBudgetTo(e.target.value);
                      }}
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-2 text-xs text-[#16273A] dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    >
                      <option value="">Select Preset...</option>
                      {budgetOptions.map((opt) => (
                        <option key={`to-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={budgetTo}
                      onChange={(e) => setBudgetTo(e.target.value)}
                      placeholder="Or enter amount..."
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Area */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3.5">
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Min Area</label>
                <input
                  type="number"
                  min={0}
                  value={minArea}
                  onChange={(e) => setMinArea(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Max Area</label>
                <input
                  type="number"
                  min={0}
                  value={maxArea}
                  onChange={(e) => setMaxArea(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                  Area Unit {minArea || maxArea ? '*' : ''}
                </label>
                <select
                  value={areaUnit}
                  onChange={(e) => setAreaUnit(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  {AREA_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Residential vs Commercial Conditional Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3.5">
              {propertyType === 'Residential' ? (
                <div>
                  <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">BHK Configuration</label>
                  <select
                    value={bhkConfig}
                    onChange={(e) => setBhkConfig(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                  >
                    <option value="">Any / Not specified</option>
                    {bhkMaster.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                      Commercial Configuration
                    </label>
                    <input
                      type="text"
                      value={commercialConfig}
                      onChange={(e) => setCommercialConfig(e.target.value)}
                      placeholder="e.g., Executive Suite"
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Workstations</label>
                    <input
                      type="number"
                      min={0}
                      value={reqWorkstations}
                      onChange={(e) => setReqWorkstations(e.target.value)}
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Cabins</label>
                    <input
                      type="number"
                      min={0}
                      value={reqCabins}
                      onChange={(e) => setReqCabins(e.target.value)}
                      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono-tabular dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Furnishing Type</label>
                <select
                  value={furnishingType}
                  onChange={(e) => setFurnishingType(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  <option value="">Any / Not specified</option>
                  {furnishingMaster.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">
                  Preferred Floor {propertySubtype.trim().toLowerCase() === 'showroom' ? '*' : ''}
                </label>
                {propertySubtype.trim().toLowerCase() === 'showroom' ? (
                  <select
                    value={preferredFloor}
                    onChange={(e) => setPreferredFloor(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                  >
                    <option value="Ground Floor">Ground Floor</option>
                    <option value="First Floor">First Floor</option>
                    <option value="Second Floor">Second Floor</option>
                    <option value="Third Floor">Third Floor</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={preferredFloor}
                    onChange={(e) => setPreferredFloor(e.target.value)}
                    placeholder="e.g., Higher Floor"
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Possession Preference</label>
                <select
                  value={possessionPref}
                  onChange={(e) => setPossessionPref(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  <option value="">Any / Not specified</option>
                  {possessionMaster.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Requirement Remarks</label>
              <input
                type="text"
                value={requirementRemarks}
                onChange={(e) => setRequirementRemarks(e.target.value)}
                placeholder="Vastu facing, parking needs, school proximity, etc."
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
              />
            </div>
          </div>

          {/* Section 3: Optional First Follow-up (PRD 7.5) */}
          <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E3349]">
            <h3 className="text-xs font-semibold text-[#C99B56] mb-3">03. First Follow-up Planning (Optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Activity Type</label>
                <select
                  value={firstFollowupType}
                  onChange={(e) => setFirstFollowupType(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                >
                  <option value="Follow-up Call">Follow-up Call</option>
                  <option value="WhatsApp Follow-up">WhatsApp Follow-up</option>
                  <option value="Site Visit">Site Visit</option>
                  <option value="Meeting">Meeting</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Date</label>
                <input
                  type="date"
                  value={firstFollowupDate}
                  onChange={(e) => setFirstFollowupDate(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Time</label>
                <input
                  type="time"
                  value={firstFollowupTime}
                  onChange={(e) => setFirstFollowupTime(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#404040] dark:text-[#D4D4D4] mb-1">Notes</label>
                <input
                  type="text"
                  value={firstFollowupRemarks}
                  onChange={(e) => setFirstFollowupRemarks(e.target.value)}
                  placeholder="Optional agenda"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3349] dark:bg-[#0C141E] dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3349]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-medium text-[#16273A] hover:bg-[#FBF6EE] dark:border-[#1E3349] dark:text-white dark:hover:bg-[#1A2C40]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#16273A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#20364F] disabled:opacity-50 dark:bg-[#C99B56] dark:text-[#16273A]"
            >
              {saving ? 'Creating Lead...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
