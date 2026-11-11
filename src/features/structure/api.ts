import { http } from '@/lib/http';

// Phase 8. `externalId !== null` means the row is owned by HR sync (read-only in the UI).

export interface Grade {
  id: string;
  name: string;
  minSalary: number;
  maxSalary: number;
  companyId: string;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GradeWithRules = Grade & {
  allowances?: { amount: number; allowanceDefinition: { name: string } }[];
  deductions?: { amount: number; deductionDefinition: { name: string } }[];
};

export interface GradeInput {
  name: string;
  minSalary: number;
  maxSalary: number;
}

export interface Position {
  id: string;
  positionName: string;
  description: string | null;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PositionInput {
  positionName: string;
  description?: string;
}

export interface Department {
  id: string;
  deptName: string;
  parentId: string | null;
  location: string | null;
  shorthandRepresentation: string;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
}

export type DepartmentTree = Department & {
  assignments?: { id: string; employeeId: string; departmentId: string; fromDate: string; toDate: string | null }[];
  children?: DepartmentTree[];
};

export interface DepartmentInput {
  deptName: string;
  shorthandRepresentation?: string;
  location?: string;
}

const d = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const structureKeys = {
  grades: ['structure', 'grades'] as const,
  positions: ['structure', 'positions'] as const,
  departments: ['structure', 'departments'] as const,
  departmentTree: (id: string) => ['structure', 'departments', id] as const,
};

/** Drop empty optional strings so strict schemas don't reject "". */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined)) as T;
}

export const gradesApi = {
  list: () => d<GradeWithRules[]>(http.get('/grades')),
  create: (input: GradeInput) => d<Grade>(http.post('/grades', input)),
  update: (id: string, input: Partial<GradeInput>) => d<Grade>(http.post(`/grades/${id}`, input)),
  remove: (id: string) => http.post(`/grades/delete/${id}`),
};

export const positionsApi = {
  list: () => d<Position[]>(http.get('/positions')),
  create: (input: PositionInput) => d<Position>(http.post('/positions', clean(input))),
  update: (id: string, input: Partial<PositionInput>) => d<Position>(http.post(`/positions/${id}`, clean(input))),
  remove: (id: string) => d<Position>(http.post(`/positions/delete/${id}`)),
};

export const departmentsApi = {
  list: () => d<Department[]>(http.get('/departments')),
  tree: (id: string) => d<DepartmentTree | null>(http.get(`/departments/${id}`)),
  create: (input: DepartmentInput) => d<Department>(http.post('/departments', clean(input))),
  createSub: (input: DepartmentInput & { parentDepartmentId: string }) =>
    d<Department>(http.post('/departments/sub-department', clean(input))),
  update: (id: string, input: Partial<DepartmentInput>) => d<Department>(http.post(`/departments/${id}`, clean(input))),
  remove: (id: string) => d<Department>(http.post(`/departments/delete/${id}`)),
};
