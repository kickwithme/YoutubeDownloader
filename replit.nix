{ pkgs }: {
    deps = [
        pkgs.python3
        pkgs.python3Packages.pip
        pkgs.nodejs
        pkgs.nodePackages.typescript
        pkgs.ffmpeg
        pkgs.yarn
    ];
} 