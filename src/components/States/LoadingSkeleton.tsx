import React from 'react';

/**
 * LoadingSkeleton - Animated skeleton loader matching dashboard layout
 * Lines 895-911 from template
 */
const LoadingSkeleton = (): React.JSX.Element => {
  return (
    <div className="view space-y-8 animate-pulse">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 h-24">
          <div className="h-3 w-20 bg-surface-3 rounded mb-3"></div>
          <div className="h-6 w-14 bg-surface-3 rounded"></div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 h-24">
          <div className="h-3 w-20 bg-surface-3 rounded mb-3"></div>
          <div className="h-6 w-14 bg-surface-3 rounded"></div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 h-24">
          <div className="h-3 w-20 bg-surface-3 rounded mb-3"></div>
          <div className="h-6 w-14 bg-surface-3 rounded"></div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 h-24">
          <div className="h-3 w-20 bg-surface-3 rounded mb-3"></div>
          <div className="h-6 w-14 bg-surface-3 rounded"></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-surface border border-border rounded-xl h-48"></div>
        <div className="bg-surface border border-border rounded-xl h-48"></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl h-40"></div>
        <div className="bg-surface border border-border rounded-xl h-40"></div>
        <div className="bg-surface border border-border rounded-xl h-40"></div>
      </div>
    </div>
  );
};

export default LoadingSkeleton;
