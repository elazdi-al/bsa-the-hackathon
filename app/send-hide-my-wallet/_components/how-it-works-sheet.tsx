import { HelpIcon, ShieldIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTrigger } from "@/components/ui/drawer";
import { howItWorks } from "../data";

export function HowItWorksSheet() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-1 rounded-sm text-body text-muted-foreground outline-offset-2 outline-ring transition-opacity after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:outline-2 active:opacity-60"
        >
          How it works
          <HelpIcon size={16} />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader
            icon={
              <span className="grid size-14 place-items-center rounded-full bg-fuse-blue/12 text-fuse-blue">
                <ShieldIcon size={32} />
              </span>
            }
            title="Hide My Wallet"
            description="Send without revealing the wallet your money lives in."
          />
          <ul className="mt-6 flex flex-col gap-5 px-6">
            {howItWorks.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <Icon className="shrink-0 text-fuse-blue" />
                <p>
                  <span className="block text-label">{title}</span>
                  <span className="block text-body text-pretty text-muted-foreground">{body}</span>
                </p>
              </li>
            ))}
          </ul>
          <div className="px-6">
            <DrawerClose asChild>
              <Button className="mt-8 w-full">Got it</Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
