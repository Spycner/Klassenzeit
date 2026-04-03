import { use } from "react";
import {
  SchoolContext,
  type SchoolContextValue,
} from "@/providers/school-provider";

export function useSchool(): SchoolContextValue {
  return use(SchoolContext);
}
