FROM node:22-alpine AS webbuild

WORKDIR /web
COPY react-app/package.json react-app/package-lock.json ./
RUN npm ci
COPY react-app/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src
COPY . .

WORKDIR /src/Server/src/Vanguard.Bootstrapper
RUN dotnet restore
RUN dotnet publish -c Release -o /app/publish --no-restore

RUN mkdir -p /app/publish/wwwroot
COPY --from=webbuild /web/dist/ /app/publish/wwwroot/

FROM mcr.microsoft.com/dotnet/aspnet:10.0

WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Vanguard.Bootstrapper.dll"]
