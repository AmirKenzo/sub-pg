import { useSupportUrl } from '@/hooks/useUserData';
import { useTranslation } from 'react-i18next';
import { LifeBuoy } from 'lucide-react';
import type { FC } from 'react';

export const Footer: FC = ({ ...props }) => {
  const { t } = useTranslation();
  const { supportUrl } = useSupportUrl();

  return (
    <footer className="relative w-full px-4 pt-10 pb-8" {...props}>
      {supportUrl && (
        <div className="mx-auto flex max-w-6xl justify-center">
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <LifeBuoy className="size-4" />
            {t('userInfo.supportUrl')}
          </a>
        </div>
      )}
    </footer>
  );
};
