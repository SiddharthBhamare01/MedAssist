/**
 * AnemiaJourney — standalone page for the recovery trajectory.
 *
 * The trajectory's primary home is inline on the analysis page (rendered by
 * RecoveryJourneyCard, no click-through). This page is the same component with a
 * page header, for viewing the journey without opening a specific report.
 */

import { useTranslation } from 'react-i18next';
import RecoveryJourneyCard from '../../components/RecoveryJourneyCard';

export default function AnemiaJourney() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('journey.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('journey.subtitle')}</p>
      </div>

      <RecoveryJourneyCard />
    </div>
  );
}
