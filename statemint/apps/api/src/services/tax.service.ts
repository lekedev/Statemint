import { prisma } from '../lib/prisma'
import { Prisma, TaxUserType } from '@prisma/client'

// ─── 2026 Tax Bands (new Finance Act) ────────────────────────────────────────
// First ₦800,000 is completely tax-free
// Tax is calculated on income ABOVE ₦800,000

const TAX_FREE_THRESHOLD = 800_000

const TAX_BANDS_2026 = [
  { min: 800_000, max: 1_600_000, rate: 0.15 },
  { min: 1_600_000, max: 3_200_000, rate: 0.19 },
  { min: 3_200_000, max: 4_800_000, rate: 0.21 },
  { min: 4_800_000, max: Infinity, rate: 0.24 },
]

// ─── Nigerian States IRS Directory ───────────────────────────────────────────

export const NIGERIAN_STATES: Record<
  string,
  { name: string; irsName: string; portal: string }
> = {
  abia: { name: 'Abia State', irsName: 'Abia State IRS', portal: 'https://abiairs.gov.ng' },
  adamawa: { name: 'Adamawa State', irsName: 'Adamawa State IRS', portal: 'https://ad-irs.adamawastate.gov.ng' },
  akwa_ibom: { name: 'Akwa Ibom State', irsName: 'Akwa Ibom IRS', portal: 'https://akirs.ak.gov.ng' },
  anambra: { name: 'Anambra State', irsName: 'Anambra State IRS', portal: 'https://tax.services.an.gov.ng' },
  bauchi: { name: 'Bauchi State', irsName: 'Bauchi IRS', portal: 'https://birs.bu.gov.ng' },
  bayelsa: { name: 'Bayelsa State', irsName: 'Bayelsa IRS', portal: 'https://bir.by.gov.ng' },
  benue: { name: 'Benue State', irsName: 'Benue IRS', portal: 'https://birs.be.gov.ng' },
  borno: { name: 'Borno State', irsName: 'Borno IRS', portal: 'https://birs.bo.gov.ng' },
  cross_river: { name: 'Cross River State', irsName: 'Cross River IRS', portal: 'https://crirs.crossriverstate.gov.ng' },
  delta: { name: 'Delta State', irsName: 'Delta IRS', portal: 'https://deltairs.com' },
  ebonyi: { name: 'Ebonyi State', irsName: 'Ebonyi IRS', portal: 'https://tax.ebsirb.eb.gov.ng' },
  edo: { name: 'Edo State', irsName: 'Edo IRS', portal: 'https://eirs.gov.ng' },
  ekiti: { name: 'Ekiti State', irsName: 'Ekiti IRS', portal: 'https://ekitistaterevenue.com' },
  enugu: { name: 'Enugu State', irsName: 'Enugu IRS', portal: 'https://irs.en.gov.ng' },
  fct: { name: 'FCT (Abuja)', irsName: 'FCT IRS', portal: 'https://fctirs.gov.ng' },
  gombe: { name: 'Gombe State', irsName: 'Gombe IRS', portal: 'https://irs.gm.gov.ng' },
  imo: { name: 'Imo State', irsName: 'Imo IRS', portal: 'https://iirs.im.gov.ng' },
  jigawa: { name: 'Jigawa State', irsName: 'Jigawa IRS', portal: 'https://jsirs.org.ng' },
  kaduna: { name: 'Kaduna State', irsName: 'Kaduna IRS', portal: 'https://kadirs.kdsg.gov.ng' },
  kano: { name: 'Kano State', irsName: 'Kano IRS', portal: 'https://kirs.gov.ng' },
  katsina: { name: 'Katsina State', irsName: 'Katsina IRS', portal: 'https://irs.kt.gov.ng' },
  kebbi: { name: 'Kebbi State', irsName: 'Kebbi IRS', portal: 'https://irs.kb.gov.ng/etax' },
  kogi: { name: 'Kogi State', irsName: 'Kogi IRS', portal: 'https://irs.kg.gov.ng' },
  kwara: { name: 'Kwara State', irsName: 'Kwara IRS', portal: 'https://irs.kw.gov.ng' },
  lagos: { name: 'Lagos State', irsName: 'Lagos IRS (LIRS)', portal: 'https://etax.lirs.net' },
  nasarawa: { name: 'Nasarawa State', irsName: 'Nasarawa IRS', portal: 'https://irs.na.gov.ng' },
  niger: { name: 'Niger State', irsName: 'Niger IRS', portal: 'https://ngsirs.gov.ng' },
  ogun: { name: 'Ogun State', irsName: 'Ogun IRS', portal: 'https://portal.ogetax.ogunstate.gov.ng' },
  ondo: { name: 'Ondo State', irsName: 'Ondo IRS', portal: 'https://odirs.ng' },
  osun: { name: 'Osun State', irsName: 'Osun IRS', portal: 'https://irs.os.gov.ng' },
  oyo: { name: 'Oyo State', irsName: 'Oyo IRS', portal: 'https://bir.oyostate.gov.ng' },
  plateau: { name: 'Plateau State', irsName: 'Plateau IRS', portal: 'https://psirs.gov.ng' },
  rivers: { name: 'Rivers State', irsName: 'Rivers IRS', portal: 'https://riversbirs.gov.ng' },
  sokoto: { name: 'Sokoto State', irsName: 'Sokoto IRS', portal: 'https://itas.irs.sk.gov.ng' },
  taraba: { name: 'Taraba State', irsName: 'Taraba IRS', portal: 'https://tarabaitas.ng' },
  yobe: { name: 'Yobe State', irsName: 'Yobe IRS', portal: 'https://irs.yb.gov.ng' },
  zamfara: { name: 'Zamfara State', irsName: 'Zamfara IRS', portal: 'https://irs.zm.gov.ng' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaxBandBreakdown {
  band: string
  rate: number
  taxableAmount: number
  taxDue: number
}

export interface DeductionItem {
  name: string
  amount: number
  applicable: boolean
  description: string
  saves: number
}

export interface ChecklistItem {
  item: string
  completed: boolean
  note: string
}

export interface TaxCalculationResult {
  userType: TaxUserType
  taxYear: number
  grossIncome: number
  totalDeductions: number
  chargeableIncome: number
  totalTax: number
  monthlyTax: number
  effectiveRate: number
  isTaxFree: boolean
  breakdown: TaxBandBreakdown[]
  deductions: DeductionItem[]
  checklist: ChecklistItem[]
  paymentGuide: {
    stateName: string
    irsName: string
    portal: string
    deadline: string
    steps: string[]
  }
}

export interface TaxProfileInput {
  userType: TaxUserType
  stateOfResidence: string
  monthlyRent?: number
  pensionRate?: number
  nhfRate?: number
  nhisRate?: number
  lifeInsurance?: number
}

// ─── Smart income detection ───────────────────────────────────────────────────

export async function detectIncomeProfile(
  documentId: string,
  userId: string
): Promise<{
  suggestedType: TaxUserType
  grossIncome: number
  incomeBreakdown: { source: string; amount: number; count: number }[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}> {
  const transactions = await prisma.transaction.findMany({
    where: {
      documentId,
      document: { userId },
      type: 'CREDIT',
    },
  })

  if (transactions.length === 0) {
    return {
      suggestedType: 'PAYE',
      grossIncome: 0,
      incomeBreakdown: [],
      confidence: 'LOW',
    }
  }

  // Group credits by description pattern
  const salaryKeywords = ['salary', 'payroll', 'wages', 'employment', 'staff']
  const businessKeywords = ['invoice', 'payment for', 'service', 'contract', 'supply']
  const freelanceKeywords = ['freelance', 'project', 'commission', 'gig', 'consulting']

  let salaryCount = 0
  let businessCount = 0
  let freelanceCount = 0
  let totalIncome = 0

  const sourceMap = new Map<string, { amount: number; count: number }>()

  for (const t of transactions) {
    const desc = t.description.toLowerCase()
    const amount = Number(t.amount)
    totalIncome += amount

    // Detect income type from description
    if (salaryKeywords.some((k) => desc.includes(k))) salaryCount++
    else if (businessKeywords.some((k) => desc.includes(k))) businessCount++
    else if (freelanceKeywords.some((k) => desc.includes(k))) freelanceCount++

    // Group by source
    const sourceKey = t.description.slice(0, 30)
    const existing = sourceMap.get(sourceKey) || { amount: 0, count: 0 }
    sourceMap.set(sourceKey, {
      amount: existing.amount + amount,
      count: existing.count + 1,
    })
  }

  // Determine suggested user type
  let suggestedType: TaxUserType = 'PAYE'
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'

  const uniqueSources = sourceMap.size
  const hasRegularSalary = salaryCount > 0

  if (hasRegularSalary) {
    suggestedType = 'PAYE'
    confidence = 'HIGH'
  } else if (uniqueSources >= 3 || freelanceCount > 0) {
    suggestedType = 'SELF_EMPLOYED'
    confidence = uniqueSources >= 5 ? 'HIGH' : 'MEDIUM'
  } else if (businessCount > 0 || totalIncome > 2_000_000) {
    suggestedType = 'BUSINESS'
    confidence = 'MEDIUM'
  } else {
    // Default — single income source, likely PAYE
    suggestedType = 'PAYE'
    confidence = 'LOW'
  }

  // Annualise income from statement period
  // Statement is typically 1 month — multiply by 12
  const grossIncome = totalIncome * 12

  const incomeBreakdown = Array.from(sourceMap.entries())
    .map(([source, { amount, count }]) => ({ source, amount: amount * 12, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  return { suggestedType, grossIncome, incomeBreakdown, confidence }
}

// ─── Core tax calculation engine ──────────────────────────────────────────────

function calculatePAYETax(chargeableIncome: number): {
  totalTax: number
  breakdown: TaxBandBreakdown[]
} {
  if (chargeableIncome <= TAX_FREE_THRESHOLD) {
    return { totalTax: 0, breakdown: [] }
  }

  let totalTax = 0
  const breakdown: TaxBandBreakdown[] = []
  let remaining = chargeableIncome

  for (const band of TAX_BANDS_2026) {
    if (remaining <= band.min) break

    const taxableInBand = Math.min(remaining, band.max) - band.min
    if (taxableInBand <= 0) continue

    const taxDue = taxableInBand * band.rate
    totalTax += taxDue

    breakdown.push({
      band: `₦${band.min.toLocaleString()} - ${band.max === Infinity ? 'above' : '₦' + band.max.toLocaleString()}`,
      rate: band.rate * 100,
      taxableAmount: taxableInBand,
      taxDue,
    })
  }

  return { totalTax, breakdown }
}

function calculateDeductions(
  grossIncome: number,
  profile: TaxProfileInput
): DeductionItem[] {
  const deductions: DeductionItem[] = []

  // Pension contribution (8% of gross income)
  const pensionRate = profile.pensionRate ?? 0.08
  const pensionAmount = grossIncome * pensionRate
  deductions.push({
    name: 'Pension Contribution (PFA)',
    amount: pensionAmount,
    applicable: true,
    description: `${(pensionRate * 100).toFixed(0)}% of gross income`,
    saves: pensionAmount * 0.15,
  })

  // National Housing Fund (2.5% of basic salary)
  const nhfRate = profile.nhfRate ?? 0.025
  const nhfAmount = grossIncome * nhfRate
  deductions.push({
    name: 'National Housing Fund (NHF)',
    amount: nhfAmount,
    applicable: true,
    description: `${(nhfRate * 100).toFixed(1)}% of basic salary`,
    saves: nhfAmount * 0.15,
  })

  // NHIS (5% of gross income)
  const nhisRate = profile.nhisRate ?? 0.05
  const nhisAmount = grossIncome * nhisRate
  deductions.push({
    name: 'National Health Insurance (NHIS)',
    amount: nhisAmount,
    applicable: true,
    description: `${(nhisRate * 100).toFixed(0)}% of gross income`,
    saves: nhisAmount * 0.15,
  })

  // Rent relief (20% of annual rent, capped at ₦500,000)
  if (profile.monthlyRent && profile.monthlyRent > 0) {
    const annualRent = Number(profile.monthlyRent) * 12
    const rentRelief = Math.min(annualRent * 0.2, 500_000)
    deductions.push({
      name: 'Rent Relief',
      amount: rentRelief,
      applicable: true,
      description: '20% of annual rent paid (max ₦500,000)',
      saves: rentRelief * 0.15,
    })
  } else {
    deductions.push({
      name: 'Rent Relief',
      amount: 0,
      applicable: false,
      description: 'Add your monthly rent to claim this deduction',
      saves: 0,
    })
  }

  // Life insurance (up to ₦100,000)
  if (profile.lifeInsurance && Number(profile.lifeInsurance) > 0) {
    const lifeAmount = Math.min(Number(profile.lifeInsurance), 100_000)
    deductions.push({
      name: 'Life Insurance Premium',
      amount: lifeAmount,
      applicable: true,
      description: 'Life insurance premiums (max ₦100,000)',
      saves: lifeAmount * 0.15,
    })
  } else {
    deductions.push({
      name: 'Life Insurance Premium',
      amount: 0,
      applicable: false,
      description: 'Add your life insurance premium to claim this deduction',
      saves: 0,
    })
  }

  return deductions
}

function buildChecklist(
  profile: TaxProfileInput,
  userType: TaxUserType
): ChecklistItem[] {
  return [
    {
      item: 'Bank Statement',
      completed: true,
      note: 'Already uploaded to Statemint ✓',
    },
    {
      item: 'BVN (Bank Verification Number)',
      completed: false,
      note: 'Required for registration on your state IRS portal',
    },
    {
      item: 'Taxpayer ID (TIN)',
      completed: false,
      note: 'Register on your state IRS portal if you do not have one',
    },
    {
      item: 'Pension Contribution Statement',
      completed: false,
      note: 'Download from your PFA app (e.g. Stanbic, ARM, Leadway)',
    },
    {
      item: 'NHF Contribution Proof',
      completed: false,
      note: 'Get from Federal Mortgage Bank of Nigeria',
    },
    {
      item: 'Rent Payment Receipt / Tenancy Agreement',
      completed: profile.monthlyRent ? profile.monthlyRent > 0 : false,
      note: 'Required to claim rent relief deduction',
    },
    {
      item: 'Life Insurance Certificate',
      completed:
        profile.lifeInsurance ? Number(profile.lifeInsurance) > 0 : false,
      note: 'Required to claim life insurance deduction (max ₦100,000)',
    },
    ...(userType === 'SELF_EMPLOYED' || userType === 'BUSINESS'
      ? [
          {
            item: 'Business Income Records',
            completed: true,
            note: 'Income extracted from your uploaded statement',
          },
          {
            item: 'Business Expense Records',
            completed: false,
            note: 'Invoices and receipts for deductible business expenses',
          },
        ]
      : [
          {
            item: 'Employment Letter / Payslip',
            completed: false,
            note: 'Confirms your employment and salary details',
          },
        ]),
  ]
}

function buildPaymentGuide(stateKey: string): {
  stateName: string
  irsName: string
  portal: string
  deadline: string
  steps: string[]
} {
  const state = NIGERIAN_STATES[stateKey.toLowerCase()] || NIGERIAN_STATES['lagos']

  return {
    stateName: state.name,
    irsName: state.irsName,
    portal: state.portal,
    deadline: 'March 31, 2027 (for 2026 income)',
    steps: [
      `Visit ${state.portal}`,
      'Click Sign Up if you do not have a taxpayer ID, or Sign In if you do',
      'Use your BVN and date of birth to register',
      'Navigate to Returns → My Tax Returns → File Returns',
      'Select tax year 2026',
      'Enter your gross income (use the figure Statemint calculated)',
      'Add your deductions (pension, NHF, NHIS, rent relief)',
      'Upload your bank statement and supporting documents',
      'Review and submit',
      'Pay any outstanding tax balance by card or at a listed bank',
      'Download your Tax Clearance Certificate',
    ],
  }
}

// ─── Main calculate function ──────────────────────────────────────────────────

export async function calculateTax(
  documentId: string,
  userId: string,
  profile: TaxProfileInput
): Promise<TaxCalculationResult> {
  // Get gross income from smart detection or use statement credits
  const detection = await detectIncomeProfile(documentId, userId)
  const grossIncome = detection.grossIncome

  // Calculate deductions
  const deductions = calculateDeductions(grossIncome, profile)
  const totalDeductions = deductions
    .filter((d) => d.applicable)
    .reduce((sum, d) => sum + d.amount, 0)

  // Chargeable income
  const chargeableIncome = Math.max(0, grossIncome - totalDeductions)

  // Tax calculation
  const { totalTax, breakdown } = calculatePAYETax(chargeableIncome)
  const monthlyTax = totalTax / 12
  const effectiveRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0
  const isTaxFree = chargeableIncome <= TAX_FREE_THRESHOLD

  // Checklist
  const checklist = buildChecklist(profile, profile.userType)

  // Payment guide
  const paymentGuide = buildPaymentGuide(profile.stateOfResidence)

  // Persist calculation
  const taxProfile = await prisma.taxProfile.upsert({
    where: { userId },
    update: {
      userType: profile.userType,
      stateOfResidence: profile.stateOfResidence,
      monthlyRent: profile.monthlyRent,
      pensionRate: profile.pensionRate ?? 0.08,
      nhfRate: profile.nhfRate ?? 0.025,
      nhisRate: profile.nhisRate ?? 0.05,
      lifeInsurance: profile.lifeInsurance,
    },
    create: {
      userId,
      userType: profile.userType,
      stateOfResidence: profile.stateOfResidence,
      monthlyRent: profile.monthlyRent,
      pensionRate: profile.pensionRate ?? 0.08,
      nhfRate: profile.nhfRate ?? 0.025,
      nhisRate: profile.nhisRate ?? 0.05,
      lifeInsurance: profile.lifeInsurance,
    },
  })

  await prisma.taxCalculation.create({
    data: {
      documentId,
      userId,
      taxProfileId: taxProfile.id,
      userType: profile.userType,
      taxYear: 2026,
      grossIncome,
      totalDeductions,
      chargeableIncome,
      totalTax,
      monthlyTax,
      effectiveRate,
      breakdown: breakdown as unknown as Prisma.InputJsonValue,
      deductions: deductions as unknown as Prisma.InputJsonValue,
      checklist: checklist as unknown as Prisma.InputJsonValue,
    },
  })

  return {
    userType: profile.userType,
    taxYear: 2026,
    grossIncome,
    totalDeductions,
    chargeableIncome,
    totalTax,
    monthlyTax,
    effectiveRate,
    isTaxFree,
    breakdown,
    deductions,
    checklist,
    paymentGuide,
  }
}

// ─── Get latest calculation ───────────────────────────────────────────────────

export async function getLatestTaxCalculation(
  documentId: string,
  userId: string
): Promise<TaxCalculationResult | null> {
  const calculation = await prisma.taxCalculation.findFirst({
    where: { documentId, userId },
    orderBy: { createdAt: 'desc' },
  })

  if (!calculation) return null

  const profile = await prisma.taxProfile.findUnique({
    where: { id: calculation.taxProfileId },
  })

  if (!profile) return null

  return {
    userType: calculation.userType,
    taxYear: calculation.taxYear,
    grossIncome: Number(calculation.grossIncome),
    totalDeductions: Number(calculation.totalDeductions),
    chargeableIncome: Number(calculation.chargeableIncome),
    totalTax: Number(calculation.totalTax),
    monthlyTax: Number(calculation.monthlyTax),
    effectiveRate: calculation.effectiveRate,
    isTaxFree: Number(calculation.chargeableIncome) <= TAX_FREE_THRESHOLD,
    breakdown: calculation.breakdown as unknown as TaxBandBreakdown[],
    deductions: calculation.deductions as unknown as DeductionItem[],
    checklist: calculation.checklist as unknown as ChecklistItem[],
    paymentGuide: buildPaymentGuide(profile.stateOfResidence),
  }
}