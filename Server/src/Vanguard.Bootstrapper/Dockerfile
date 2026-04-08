FROM mcr.microsoft.com/dotnet/sdk:10.0

WORKDIR /src

COPY . .

WORKDIR /src/Server/src/Vanguard.Bootstrapper

EXPOSE 5109

ENV ASPNETCORE_URLS=http://0.0.0.0:5109
ENV ASPNETCORE_ENVIRONMENT=Development

CMD ["dotnet", "watch", "run", "--urls", "http://0.0.0.0:5109"]
