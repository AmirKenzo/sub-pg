import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorDown, Share, SquarePlus, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isIosSafari, isStandalone, setupWebAppManifest, type BeforeInstallPromptEvent } from '@/lib/pwa';

interface InstallAppButtonProps {
  username: string;
}

export function InstallAppButton({ username }: InstallAppButtonProps) {
  const { t } = useTranslation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const canShowIosGuide = isIosSafari();

  useEffect(() => {
    setupWebAppManifest(username);
  }, [username]);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed || (!installEvent && !canShowIosGuide)) return null;

  const handleClick = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setInstallEvent(null);
      return;
    }
    setShowIosGuide(true);
  };

  const iosSteps = [
    { icon: Share, text: t('install.iosStep1') },
    { icon: SquarePlus, text: t('install.iosStep2') },
    { icon: CircleCheck, text: t('install.iosStep3') },
  ];

  return (
    <>
      <Button variant="outline" size="icon" onClick={handleClick} title={t('install.button')} aria-label={t('install.button')}>
        <MonitorDown className="h-4 w-4" />
      </Button>

      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('install.title')}</DialogTitle>
          </DialogHeader>
          <ol className="space-y-3">
            {iosSteps.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 text-sm text-foreground">
                <span className="icon-chip size-8">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ol>
          <Button className="w-full" onClick={() => setShowIosGuide(false)}>
            {t('install.close')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
