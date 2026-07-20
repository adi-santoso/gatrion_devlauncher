const colorMap = {
  success: 'bg-success',
  danger: 'bg-danger',
  accent: 'bg-accent',
  faint: 'bg-ink-faint',
  info: 'bg-ink-faint'
};

export default function ActivityList({ activities = [] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 shadow-card">
      <h3 className="font-display font-bold text-sm mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex gap-3">
            <span className={`w-1.5 h-1.5 rounded-full ${colorMap[activity.type] || 'bg-ink-faint'} mt-1.5 shrink-0`}></span>
            <div className="min-w-0">
              <p className="text-sm text-ink">
                <span className="font-medium">{activity.project}</span> {activity.message}
              </p>
              <p className="text-xs text-ink-faint font-mono">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
