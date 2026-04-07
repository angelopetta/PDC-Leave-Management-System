// Sample data for the UI skeleton — matches the interactive prototype
// screenshots the client has already reviewed. Every value here is hardcoded
// and will be replaced by real queries against Supabase once the leave
// request flow is wired up.
//
// When a real page starts pulling from the database, delete the corresponding
// export from this file.

export type LeaveTypeCode =
  | "vacation"
  | "sick"
  | "personal"
  | "cultural"
  | "bereavement";

export const LEAVE_TYPES: {
  code: LeaveTypeCode;
  name: string;
  color: string; // Tailwind bg-* class
  dot: string; // Tailwind bg-* class for the small dot
  border: string; // for calendar chip borders
}[] = [
  {
    code: "vacation",
    name: "Vacation",
    color: "bg-blue-500",
    dot: "bg-blue-500",
    border: "border-blue-500",
  },
  {
    code: "sick",
    name: "Sick",
    color: "bg-red-500",
    dot: "bg-red-500",
    border: "border-red-500",
  },
  {
    code: "personal",
    name: "Personal",
    color: "bg-violet-500",
    dot: "bg-violet-500",
    border: "border-violet-500",
  },
  {
    code: "cultural",
    name: "Cultural/Ceremonial",
    color: "bg-amber-500",
    dot: "bg-amber-500",
    border: "border-amber-500",
  },
  {
    code: "bereavement",
    name: "Bereavement",
    color: "bg-zinc-600",
    dot: "bg-zinc-600",
    border: "border-zinc-600",
  },
];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const DASHBOARD_METRICS = {
  pending: 4,
  approvedYtd: 5,
  deniedYtd: 1,
  totalDaysOff: 12,
};

export const DASHBOARD_USAGE: {
  type: LeaveTypeCode;
  used: number;
  total: number;
}[] = [
  { type: "vacation", used: 33, total: 180 },
  { type: "sick", used: 31, total: 120 },
  { type: "personal", used: 4, total: 36 },
  { type: "cultural", used: 8, total: 60 },
  { type: "bereavement", used: 0, total: 60 },
];

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type RequestStatus = "pending" | "approved" | "denied";

export type SampleRequest = {
  id: string;
  employeeInitials: string;
  employeeName: string;
  employeeDept: string;
  type: LeaveTypeCode;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: RequestStatus;
  reviewedOn?: string;
};

export const SAMPLE_REQUESTS: SampleRequest[] = [
  {
    id: "r1",
    employeeInitials: "CM",
    employeeName: "Chris Martin",
    employeeDept: "Lands & Resources",
    type: "cultural",
    startDate: "Jun 21",
    endDate: "Jun 23",
    days: 3,
    reason: "National Indigenous Peoples Day observance",
    status: "pending",
  },
  {
    id: "r2",
    employeeInitials: "JM",
    employeeName: "James Morin",
    employeeDept: "Finance",
    type: "vacation",
    startDate: "May 18",
    endDate: "May 22",
    days: 5,
    reason: "Camping trip with family",
    status: "pending",
  },
  {
    id: "r3",
    employeeInitials: "RC",
    employeeName: "Robert Cree",
    employeeDept: "Facilities",
    type: "sick",
    startDate: "Mar 26",
    endDate: "Mar 26",
    days: 1,
    reason: "Not feeling well",
    status: "approved",
    reviewedOn: "2026-03-26",
  },
  {
    id: "r4",
    employeeInitials: "SW",
    employeeName: "Sarah Whiteduck",
    employeeDept: "Administration",
    type: "vacation",
    startDate: "Apr 6",
    endDate: "Apr 10",
    days: 5,
    reason: "Family trip",
    status: "pending",
  },
  {
    id: "r5",
    employeeInitials: "MS",
    employeeName: "Michelle Sioui",
    employeeDept: "Community Services",
    type: "cultural",
    startDate: "Apr 14",
    endDate: "Apr 16",
    days: 3,
    reason: "Spring ceremony",
    status: "pending",
  },
  {
    id: "r6",
    employeeInitials: "LR",
    employeeName: "Lisa Rankin",
    employeeDept: "Health Services",
    type: "sick",
    startDate: "Mar 23",
    endDate: "Mar 24",
    days: 2,
    reason: "Medical appointment and recovery",
    status: "approved",
    reviewedOn: "2026-03-22",
  },
  {
    id: "r7",
    employeeInitials: "KO",
    employeeName: "Karen Oakes",
    employeeDept: "Education",
    type: "personal",
    startDate: "Apr 1",
    endDate: "Apr 1",
    days: 1,
    reason: "Moving day",
    status: "approved",
    reviewedOn: "2026-03-21",
  },
  {
    id: "r8",
    employeeInitials: "TB",
    employeeName: "Thomas Bell",
    employeeDept: "Community Services",
    type: "bereavement",
    startDate: "Mar 17",
    endDate: "Mar 19",
    days: 3,
    reason: "Family loss",
    status: "approved",
    reviewedOn: "2026-03-17",
  },
  {
    id: "r9",
    employeeInitials: "ND",
    employeeName: "Nina Deer",
    employeeDept: "Administration",
    type: "vacation",
    startDate: "Apr 20",
    endDate: "Apr 24",
    days: 5,
    reason: "Visit family out of province",
    status: "denied",
    reviewedOn: "2026-03-18",
  },
  {
    id: "r10",
    employeeInitials: "DP",
    employeeName: "Daniel Picard",
    employeeDept: "Administration",
    type: "vacation",
    startDate: "Mar 9",
    endDate: "Mar 13",
    days: 5,
    reason: "March break with kids",
    status: "approved",
    reviewedOn: "2026-02-22",
  },
];

// ---------------------------------------------------------------------------
// Calendar — April 2026
// ---------------------------------------------------------------------------

export type SampleCalendarEvent = {
  id: string;
  firstName: string;
  type: LeaveTypeCode;
  status: RequestStatus;
  // Inclusive day range within the month.
  startDay: number;
  endDay: number;
};

export const CALENDAR_MONTH_LABEL = "April 2026";
export const CALENDAR_YEAR = 2026;
export const CALENDAR_MONTH = 3; // 0-indexed: April

export const SAMPLE_CALENDAR_EVENTS: SampleCalendarEvent[] = [
  {
    id: "c1",
    firstName: "Karen",
    type: "personal",
    status: "approved",
    startDay: 1,
    endDay: 1,
  },
  {
    id: "c2",
    firstName: "Sarah",
    type: "vacation",
    status: "pending",
    startDay: 6,
    endDay: 10,
  },
  {
    id: "c3",
    firstName: "Michelle",
    type: "cultural",
    status: "pending",
    startDay: 14,
    endDay: 16,
  },
];

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export type SampleBalance = {
  id: string;
  initials: string;
  name: string;
  title: string;
  vacation: { used: number; total: number };
  sick: { used: number; total: number };
  personal: { used: number; total: number };
  cultural: { used: number; total: number };
  bereavement: { used: number; total: number };
};

export const SAMPLE_BALANCES: SampleBalance[] = [
  {
    id: "b1",
    initials: "SW",
    name: "Sarah Whiteduck",
    title: "Program Coordinator",
    vacation: { used: 3, total: 15 },
    sick: { used: 4, total: 10 },
    personal: { used: 1, total: 3 },
    cultural: { used: 1, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b2",
    initials: "JM",
    name: "James Morin",
    title: "Finance Officer",
    vacation: { used: 2, total: 15 },
    sick: { used: 1, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 1, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b3",
    initials: "MS",
    name: "Michelle Sioui",
    title: "Community Worker",
    vacation: { used: 2, total: 15 },
    sick: { used: 2, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 2, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b4",
    initials: "DP",
    name: "Daniel Picard",
    title: "IT Support",
    vacation: { used: 0, total: 15 },
    sick: { used: 3, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 0, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b5",
    initials: "LR",
    name: "Lisa Rankin",
    title: "Health Aide",
    vacation: { used: 5, total: 15 },
    sick: { used: 2, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 2, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b6",
    initials: "RC",
    name: "Robert Cree",
    title: "Maintenance Lead",
    vacation: { used: 1, total: 15 },
    sick: { used: 3, total: 10 },
    personal: { used: 1, total: 3 },
    cultural: { used: 1, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b7",
    initials: "KO",
    name: "Karen Oakes",
    title: "Education Coordinator",
    vacation: { used: 0, total: 15 },
    sick: { used: 4, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 0, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b8",
    initials: "TB",
    name: "Thomas Bell",
    title: "Youth Worker",
    vacation: { used: 7, total: 15 },
    sick: { used: 4, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 0, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b9",
    initials: "AS",
    name: "Angela Stone",
    title: "Admin Assistant",
    vacation: { used: 0, total: 15 },
    sick: { used: 2, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 0, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b10",
    initials: "CM",
    name: "Chris Martin",
    title: "Lands Officer",
    vacation: { used: 3, total: 15 },
    sick: { used: 0, total: 10 },
    personal: { used: 0, total: 3 },
    cultural: { used: 0, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b11",
    initials: "ND",
    name: "Nina Deer",
    title: "Receptionist",
    vacation: { used: 4, total: 15 },
    sick: { used: 3, total: 10 },
    personal: { used: 1, total: 3 },
    cultural: { used: 1, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
  {
    id: "b12",
    initials: "PR",
    name: "Paul Rivers",
    title: "Housing Inspector",
    vacation: { used: 6, total: 15 },
    sick: { used: 3, total: 10 },
    personal: { used: 1, total: 3 },
    cultural: { used: 0, total: 5 },
    bereavement: { used: 0, total: 5 },
  },
];
