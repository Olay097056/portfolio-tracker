export interface TabDefinition<T extends string> {
  id: T;
  label: string;
}

interface TabStripProps<T extends string> {
  tabs: readonly TabDefinition<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
}

export function TabStrip<T extends string>({ tabs, activeTab, onChange }: TabStripProps<T>) {
  return (
    <nav>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
