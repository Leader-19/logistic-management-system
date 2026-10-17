import type { ReactNode } from "react";

type PanelHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export default function PanelHeader({ title, description, action, className = "" }: PanelHeaderProps) {
  return (
    <div className={`panel-head ${className}`.trim()}>
      <div><h2>{title}</h2><p>{description}</p></div>
      {action}
    </div>
  );
}
