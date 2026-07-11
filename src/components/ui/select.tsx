import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select className={cn("input-field", className)} ref={ref} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export { Select };
